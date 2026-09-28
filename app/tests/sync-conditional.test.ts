import { expect, it, vi } from "vitest";
import { emptyRecords } from "../lib/until/domain";

const mocks = vi.hoisted(() => ({
  reads: [] as string[],
  r2Lists: 0,
  leaseCalls: 0,
  records: null as string | null,
  revision: 3,
}));
vi.mock("cloudflare:workers", () => ({
  env: { BUCKET: { list: async () => { mocks.r2Lists++; return { objects: [], truncated: false }; } } },
}));
vi.mock("../lib/until/storage-lock", () => ({ withAccountStorage: (_req: Request, fn: () => unknown) => { mocks.leaseCalls++; return fn(); } }));
vi.mock("../lib/until/server", () => ({
  owner: async (req: Request) => req.headers.get("oai-authenticated-user-id"),
  database: () => ({ prepare: (sql: string) => ({ bind: () => ({ first: async () => {
    mocks.reads.push(sql);
    if (sql.includes("SELECT revision")) return { revision: mocks.revision };
    return { payload: mocks.records, revision: mocks.revision };
  } }) }) }),
  failure: (error: Error) => new Response(error.message, { status: 503 }),
}));
import { GET } from "../app/api/sync/route";

it("returns a body-free unchanged check after one revision read and no R2 work", async () => {
  const records = emptyRecords();
  for (let i = 0; i < 100; i++) records.products.push({
    id: crypto.randomUUID(), name: `Representative ${i}`, brand: "", category: "Food",
    barcode: "", size: "", createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), schemaVersion: 1,
  });
  mocks.records = JSON.stringify(records);
  mocks.reads = [];
  mocks.r2Lists = 0;
  mocks.leaseCalls = 0;
  const first = await GET(new Request("https://until.test/api/sync", { headers: { "oai-authenticated-user-id": "account-a" } }));
  const fullBytes = (await first.text()).length;
  expect(first.status).toBe(200);
  expect(fullBytes).toBeGreaterThan(20000);
  expect(mocks.reads).toHaveLength(2);
  mocks.reads = [];
  const unchanged = await GET(new Request("https://until.test/api/sync", { headers: {
    "oai-authenticated-user-id": "account-a", "If-None-Match": first.headers.get("etag")!,
  } }));
  expect(unchanged.status).toBe(304);
  expect((await unchanged.arrayBuffer()).byteLength).toBe(0);
  expect(mocks.reads).toEqual(["SELECT revision FROM account_records WHERE owner=?"]);
  expect(mocks.r2Lists).toBe(0);
  expect(mocks.leaseCalls).toBe(0);
  const other = await GET(new Request("https://until.test/api/sync", { headers: {
    "oai-authenticated-user-id": "account-b", "If-None-Match": first.headers.get("etag")!,
  } }));
  expect(other.status).toBe(200);
  console.log(`Representative 100-product response: full ${fullBytes} bytes; unchanged 0 bytes; D1 reads 2 to 1; R2 lists 0 after.`);
});

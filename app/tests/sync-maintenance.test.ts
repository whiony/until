import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  last: new Map<string, number>(),
  scans: 0,
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("../lib/until/storage-lock", () => ({ withAccountStorage: (_req: Request, fn: () => unknown) => fn() }));
vi.mock("../lib/until/server-deletion", () => ({ cleanupRemotePhotos: async (_owner: string, records: unknown) => { mocks.scans++; return records; } }));
vi.mock("../lib/until/server", () => ({
  owner: async (req: Request) => req.headers.get("oai-authenticated-user-id"),
  sameOrigin: () => {},
  database: () => ({ prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({
    first: async () => sql.includes("account_maintenance")
      ? (mocks.last.has(args[0] as string) ? { last_cleanup_at: mocks.last.get(args[0] as string) } : null)
      : null,
    run: async () => {
      if (sql.includes("INSERT INTO account_maintenance")) mocks.last.set(args[0] as string, args[1] as number);
      return { meta: { changes: 1 } };
    },
  }), run: async () => ({ meta: { changes: 1 } }) }) }),
  failure: (error: Error) => new Response(error.message, { status: 503 }),
}));
import { POST } from "../app/api/sync/route";

it("gates object cleanup to one successful run per account per day", async () => {
  mocks.last.clear();
  mocks.scans = 0;
  const request = (id: string) => new Request("https://until.test/api/sync", {
    method: "POST", headers: { "oai-authenticated-user-id": id },
  });
  expect((await POST(request("account-a"))).status).toBe(204);
  expect((await POST(request("account-a"))).status).toBe(204);
  expect(mocks.scans).toBe(1);
  expect((await POST(request("account-b"))).status).toBe(204);
  expect(mocks.scans).toBe(2);
  mocks.last.set("account-a", Date.now() - 25 * 60 * 60 * 1000);
  expect((await POST(request("account-a"))).status).toBe(204);
  expect(mocks.scans).toBe(3);
});

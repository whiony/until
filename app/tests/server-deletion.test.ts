import { it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  live: undefined as unknown,
  deleted: [] as string[],
  claims: [] as { device: string }[],
  objects: [] as { key: string; uploaded: Date }[],
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    BUCKET: {
      list: async () => ({ objects: mocks.objects, truncated: false }),
      delete: async (key: string) => {
        mocks.deleted.push(key);
      },
    },
  },
}));
vi.mock("../lib/until/server", () => ({
  database: () => ({
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () =>
          sql.includes("account_records")
            ? { payload: JSON.stringify(mocks.live) }
            : null,
        all: async () => ({ results: mocks.claims }),
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }),
  }),
}));
import { cleanupRemotePhotos } from "../lib/until/server-deletion";
import { emptyRecords } from "../lib/until/domain";
it("collects only owner-scoped unshared photos and expires compact markers after cleanup", async () => {
  const r = emptyRecords(),
    id = crypto.randomUUID(),
    shared = crypto.randomUUID(),
    orphan = crypto.randomUUID();
  r.deletions = [
    {
      id: crypto.randomUUID(),
      kind: "item",
      at: "2020-01-01T00:00:00.000Z",
      photos: [id, shared],
    },
  ];
  r.products = [
    {
      id: crypto.randomUUID(),
      name: "Keep",
      brand: "",
      category: "",
      size: "",
      barcode: "",
      photoId: shared,
      createdAt: "",
      updatedAt: "",
      schemaVersion: 1,
    },
  ];
  mocks.live = r;
  mocks.deleted = [];
  mocks.objects = [
    { key: `account/owner/${orphan}`, uploaded: new Date("2020-01-01") },
  ];
  const clean = await cleanupRemotePhotos("owner", r);
  expect(mocks.deleted.sort()).toEqual(
    [`account/owner/${id}`, `account/owner/${orphan}`].sort(),
  );
  expect(clean.deletionEpoch).toBe(1);
  expect(clean.deletions).toBeUndefined();
  expect(clean.products).toEqual(r.products);
});
it("collects a large deletion queue in bounded batches without forgetting pending photos", async () => {
  const r = emptyRecords();
  r.deletions = Array.from({ length: 105 }, () => ({
    id: crypto.randomUUID(),
    kind: "item" as const,
    at: "2020-01-01T00:00:00.000Z",
    photos: [crypto.randomUUID()],
  }));
  mocks.live = r;
  mocks.deleted = [];
  mocks.objects = [];
  const first = await cleanupRemotePhotos("owner", r);
  expect(mocks.deleted).toHaveLength(100);
  expect(first.deletions).toHaveLength(5);
  expect(first.deletions!.every((d) => d.photos?.length === 1)).toBe(true);
  mocks.live = first;
  const last = await cleanupRemotePhotos("owner", first);
  expect(mocks.deleted).toHaveLength(105);
  expect(last.deletions).toBeUndefined();
});

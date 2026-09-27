import { env } from "cloudflare:workers";
import { withAccountStorage } from "@/lib/until/storage-lock";
import { cleanupRemotePhotos } from "@/lib/until/server-deletion";
import { applyDeletions, retiredPhotoIds } from "@/lib/until/deletion";
import { photoIds } from "@/lib/until/merge";
import {
  normalizeCategories,
  resolvedCategory,
  normalizeLocations,
  resolvedLocation,
} from "@/lib/until/preferences";
import {
  database,
  owner,
  failure,
  sameOrigin,
  limitedBody,
} from "@/lib/until/server";
import { z } from "zod";
import { emptyRecords, validateItem } from "@/lib/until/domain";
const date = z.string().max(10),
  id = z.string().uuid(),
  ts = z.string().datetime();
const rule = z.object({
  amount: z.number().int().min(1).max(3650),
  unit: z.enum(["days", "weeks", "months"]),
});
const product = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(200),
  category: z.string().max(100),
  barcode: z.string().max(50),
  size: z.string().max(100),
  photoId: id.optional(),
  provenance: z
    .object({
      provider: z.string().max(100),
      url: z.string().url().optional(),
      confirmedAt: ts,
      completeness: z.number().optional(),
    })
    .optional(),
  createdAt: ts,
  updatedAt: ts,
  schemaVersion: z.literal(1),
});
const item = z.object({
  id,
  productId: id,
  quantity: z.number().int().min(1).max(9999),
  printedDate: date,
  dateKind: z.enum(["best before", "use by", "unspecified"]),
  purchaseDate: date,
  openedDate: date,
  rule: rule.optional(),
  location: z.string().max(100),
  notes: z.string().max(5000),
  packagingPhotoId: id.optional(),
  recognition: z
    .object({ text: z.string().max(30000), confirmedAt: ts })
    .optional(),
  status: z.enum(["active", "used", "discarded"]),
  completedAt: ts.optional(),
  dateAcknowledgement: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/)
    .optional(),
  createdAt: ts,
  updatedAt: ts,
  schemaVersion: z.literal(1),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  deletionEpoch: z.number().int().min(0).optional(),
  deletions: z
    .array(
      z.object({
        id,
        kind: z.enum(["item", "product"]),
        at: ts,
        photos: z.array(id).max(2).optional(),
      }),
    )
    .max(60000)
    .optional(),
  products: z.array(product).max(10000),
  items: z.array(item).max(30000),
  settings: z.object({
    theme: z.enum(["green", "peach", "lavender", "blue"]).optional(),
    categoryRules: z
      .array(
        z.object({
          name: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .refine((v) => !v.startsWith("__")),
          hidden: z.boolean().optional(),
          replacement: z.string().trim().max(100).optional(),
        }),
      )
      .max(200)
      .optional(),
    locationRules: z
      .array(
        z.object({
          name: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .refine((v) => !v.startsWith("__")),
          hidden: z.boolean().optional(),
          replacement: z.string().trim().max(100).optional(),
        }),
      )
      .max(200)
      .optional(),
    soonDays: z.number().int().min(1).max(90),
    notifications: z.object({
      requested: z.boolean(),
      expirationDay: z.boolean(),
      leadDays: z.number().int().min(0).max(90),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      timezone: z
        .string()
        .max(100)
        .refine((timeZone) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone });
            return true;
          } catch {
            return false;
          }
        }),
    }),
  }),
});
async function put(req: Request) {
  try {
    sameOrigin(req);
    const key = await owner(req);
    const expected = Number(req.headers.get("If-Match"));
    if (
      !req.headers.has("If-Match") ||
      !Number.isSafeInteger(expected) ||
      expected < 0
    )
      return new Response("Version required", { status: 400 });
    let json: unknown;
    try {
      json = JSON.parse(
        new TextDecoder().decode(await limitedBody(req, 8_000_000)),
      );
    } catch (e) {
      if (e instanceof Error && e.message === "Too large") throw e;
      return new Response("Invalid JSON", { status: 400 });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      return new Response("Invalid records", { status: 400 });
    const r = parsed.data;
    try {
      const names =
        r.settings.categoryRules?.map((c) => c.name.toLocaleLowerCase("en")) ||
        [];
      if (new Set(names).size !== names.length)
        throw Error("Duplicate categories");
      const builtins = [
        "Food",
        "Beauty",
        "Medicine",
        "Supplements",
        "Household",
        "Pet",
      ];
      for (const rule of r.settings.categoryRules || []) {
        if (
          builtins.some((c) => c.toLowerCase() === rule.name.toLowerCase()) &&
          rule.replacement !== undefined
        )
          throw Error("Invalid built-in category");
        // Resolve unused rules too, so cyclic redirects can never enter storage.
        resolvedCategory(r, rule.name);
      }
      const locationKeys =
        r.settings.locationRules?.map((c) => c.name.toLocaleLowerCase("en")) ||
        [];
      if (new Set(locationKeys).size !== locationKeys.length)
        throw Error("Duplicate locations");
      const locationBuiltins = [
        "Fridge",
        "Freezer",
        "Pantry",
        "Bathroom",
        "Medicine Cabinet",
        "Pet Supplies",
      ];
      for (const rule of r.settings.locationRules || []) {
        if (
          locationBuiltins.some(
            (c) => c.toLowerCase() === rule.name.toLowerCase(),
          ) &&
          rule.replacement !== undefined
        )
          throw Error("Invalid built-in location");
        // Resolve unused rules too, so cyclic redirects can never enter storage.
        resolvedLocation(r, rule.name);
      }
      normalizeCategories(r);
      normalizeLocations(r);
    } catch {
      return new Response("Invalid categories", { status: 400 });
    }

    if (
      new Set(r.products.map((p) => p.id)).size !== r.products.length ||
      new Set(r.items.map((i) => i.id)).size !== r.items.length
    )
      return new Response("Duplicate IDs", { status: 400 });
    try {
      for (const i of r.items) {
        validateItem(i, null);
        if (!r.products.some((p) => p.id === i.productId))
          throw Error("Missing product");
      }
    } catch {
      return new Response("Invalid item", { status: 400 });
    }
    const previous = await database()
      .prepare("SELECT payload,revision FROM account_records WHERE owner=?")
      .bind(key)
      .first<{ payload: string; revision: number }>();
    if ((previous?.revision || 0) !== expected)
      return new Response("Version changed", { status: 409 });
    const before = previous ? JSON.parse(previous.payload) : null;
    if ((r.deletionEpoch || 0) !== (before?.deletionEpoch || 0))
      return new Response("Reconciliation required", { status: 409 });
    const markers = new Map(
      (before?.deletions || []).map((d: { kind: string; id: string }) => [
        `${d.kind}:${d.id}`,
        d,
      ]),
    );
    for (const d of r.deletions || []) {
      // The server's first deletion time is authoritative; clock skew cannot
      // extend marker retention indefinitely or trigger early compaction.
      const old = markers.get(`${d.kind}:${d.id}`);
      if (!old)
        markers.set(`${d.kind}:${d.id}`, {
          ...d,
          at: new Date().toISOString(),
        });
    }
    r.deletions = [...markers.values()] as NonNullable<typeof r.deletions>;
    for (const old of before?.items || [])
      if (
        !r.items.some((i) => i.id === old.id) &&
        !markers.has(`item:${old.id}`)
      )
        return new Response("Explicit deletion required", { status: 400 });
    const retired = new Set(retiredPhotoIds(before || r));
    if (photoIds(r).some((id) => retired.has(id)))
      return new Response("Photo has been retired", { status: 409 });
    applyDeletions(r);
    const previousPhotos = new Set(before ? photoIds(before) : []);
    if (env.BUCKET)
      for (const id of photoIds(r).filter((id) => !previousPhotos.has(id))) {
        if (!(await env.BUCKET.head(`account/${key}/${id}`)))
          return new Response("Photo upload required", { status: 409 });
      }
    // Atomic compare-and-swap. A stale device must pull and merge, never overwrite.
    const result =
      expected === 0
        ? await database()
            .prepare(
              "INSERT INTO account_records (owner,revision,payload,updated_at) VALUES (?,1,?,?) ON CONFLICT(owner) DO NOTHING",
            )
            .bind(key, JSON.stringify(r), new Date().toISOString())
            .run()
        : await database()
            .prepare(
              "UPDATE account_records SET revision=revision+1,payload=?,updated_at=? WHERE owner=? AND revision=?",
            )
            .bind(JSON.stringify(r), new Date().toISOString(), key, expected)
            .run();
    if (!result.meta.changes)
      return new Response("Version changed", { status: 409 });
    // Cleanup is retryable on the next pull if object storage is unavailable.
    try {
      await cleanupRemotePhotos(key, r);
    } catch {}
    return Response.json(
      { account: key, revision: expected + 1, records: r },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
async function get(req: Request) {
  try {
    const key = await owner(req);
    const row = await database()
      .prepare("SELECT payload,revision FROM account_records WHERE owner=?")
      .bind(key)
      .first<{ payload: string; revision: number }>();
    let records = row ? JSON.parse(row.payload) : null;
    let revision = row?.revision || 0;
    if (!records) {
      try {
        await cleanupRemotePhotos(key, emptyRecords());
      } catch {}
    }
    if (records) {
      try {
        const clean = await cleanupRemotePhotos(key, records);
        if (JSON.stringify(clean) !== JSON.stringify(records)) {
          const result = await database()
            .prepare(
              "UPDATE account_records SET revision=revision+1,payload=?,updated_at=? WHERE owner=? AND revision=?",
            )
            .bind(
              JSON.stringify(clean),
              new Date().toISOString(),
              key,
              revision,
            )
            .run();
          if (!result.meta.changes)
            return new Response("Version changed", { status: 409 });
          records = clean;
          revision++;
        }
      } catch {
        /* Preserve markers and retry photo cleanup on the next sync. */
      }
    }
    return Response.json(
      {
        account: key,
        revision,
        records,
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function PUT(req: Request) {
  return withAccountStorage(req, () => put(req));
}

export async function GET(req: Request) {
  return withAccountStorage(req, () => get(req));
}

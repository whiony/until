import {
  database,
  owner,
  failure,
  sameOrigin,
  limitedBody,
} from "@/lib/until/server";
import { z } from "zod";
import { validateItem } from "@/lib/until/domain";
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
  createdAt: ts,
  updatedAt: ts,
  schemaVersion: z.literal(1),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  products: z.array(product).max(10000),
  items: z.array(item).max(30000),
  settings: z.object({
    soonDays: z.number().int().min(1).max(90),
    notifications: z.object({
      requested: z.boolean(),
      expirationDay: z.boolean(),
      leadDays: z.number().int().min(0).max(90),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      quietStart: z.string().regex(/^\d{2}:\d{2}$/),
      quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().max(100),
    }),
  }),
});
export async function PUT(req: Request) {
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
    return Response.json(
      { account: key, revision: expected + 1 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const key = await owner(req);
    const row = await database()
      .prepare("SELECT payload,revision FROM account_records WHERE owner=?")
      .bind(key)
      .first<{ payload: string; revision: number }>();
    return Response.json(
      {
        account: key,
        revision: row?.revision || 0,
        records: row ? JSON.parse(row.payload) : null,
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
    );
  } catch (e) {
    return failure(e);
  }
}

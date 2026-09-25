import { database, owner, failure } from "@/lib/until/server";
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
  createdAt: ts,
  updatedAt: ts,
  schemaVersion: z.literal(1),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(1),
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
    const key = await owner(req);
    const text = await req.text();
    if (text.length > 8_000_000)
      return new Response("Too large", { status: 413 });
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json({ error: "Invalid records" }, { status: 400 });
    const r = parsed.data;
    try {
      for (const i of r.items) {
        validateItem(i, null);
        if (!r.products.some((p) => p.id === i.productId))
          throw Error("Missing product");
      }
    } catch {
      return new Response("Invalid item", { status: 400 });
    }
    await database()
      .prepare(
        "INSERT INTO device_records (owner,revision,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.revision>device_records.revision",
      )
      .bind(key, r.revision, JSON.stringify(r), new Date().toISOString())
      .run();
    return Response.json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    const key = await owner(req);
    const row = await database()
      .prepare("SELECT payload FROM device_records WHERE owner=?")
      .bind(key)
      .first<{ payload: string }>();
    return new Response(row?.payload || "null", {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

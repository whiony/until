import {
  owner,
  legacyOwner,
  database,
  failure,
  sameOrigin,
} from "@/lib/until/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const account = await owner(req);
    const key = await legacyOwner(req, account);
    if (!key) return Response.json(null);
    const row = await database()
      .prepare("SELECT payload FROM device_records WHERE owner=?")
      .bind(key)
      .first<{ payload: string }>();
    return Response.json(row ? JSON.parse(row.payload) : null, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}

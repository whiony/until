import { env } from "cloudflare:workers";
import { owner, failure } from "@/lib/until/server";
type Context = { params: Promise<{ id: string }> };
async function key(req: Request, context: Context) {
  const user = await owner(req);
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Unauthorized");
  if (!env.BUCKET) throw Error("Storage unavailable");
  return `${user}/${id}`;
}
export async function PUT(req: Request, context: Context) {
  try {
    const k = await key(req, context);
    const type = req.headers.get("Content-Type") || "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type))
      return new Response("Unsupported image", { status: 415 });
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024)
      return new Response("Too large", { status: 413 });
    if (await env.BUCKET!.head(k)) return new Response(null, { status: 204 });
    const blob = await req.arrayBuffer();
    if (blob.byteLength > 12 * 1024 * 1024)
      return new Response("Too large", { status: 413 });
    await env.BUCKET!.put(k, blob, { httpMetadata: { contentType: type } });
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request, context: Context) {
  try {
    const k = await key(req, context);
    const object = await env.BUCKET!.get(k);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

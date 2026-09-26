import { env } from "cloudflare:workers";
import { cloudPhoto } from "@/lib/until/image-metadata";
import {
  owner,
  legacyOwner,
  failure,
  sameOrigin,
  limitedBody,
} from "@/lib/until/server";
type Context = { params: Promise<{ id: string }> };
async function identity(req: Request, context: Context) {
  const account = await owner(req);
  const { id } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(id)) throw Error("Forbidden");
  if (!env.BUCKET) throw Error("Storage unavailable");
  return { account, id, key: `account/${account}/${id}` };
}
function imageType(b: Uint8Array) {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)
    return "image/png";
  if (
    new TextDecoder().decode(b.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return "";
}
export async function PUT(req: Request, c: Context) {
  try {
    sameOrigin(req);
    const { key } = await identity(req, c);
    const bytes = await limitedBody(req, 12 * 1024 * 1024);
    const type = imageType(bytes);
    if (!type || type !== req.headers.get("content-type"))
      return new Response("Invalid image", { status: 415 });
    let clean: ArrayBuffer;
    try {
      clean = await (
        await cloudPhoto(new Blob([bytes], { type }))
      ).arrayBuffer();
    } catch {
      return new Response("Invalid image", { status: 415 });
    }
    if (!(await env.BUCKET!.head(key)))
      await env.BUCKET!.put(key, clean, {
        httpMetadata: { contentType: type },
      });
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request, c: Context) {
  try {
    const { account, id, key } = await identity(req, c);
    let object = await env.BUCKET!.get(key);
    if (!object) {
      const legacy = await legacyOwner(req, account);
      if (legacy) {
        const original = await env.BUCKET!.get(`${legacy}/${id}`);
        if (original) {
          const clean = await cloudPhoto(
            new Blob([await original.arrayBuffer()], {
              type: original.httpMetadata?.contentType || "image/jpeg",
            }),
          );
          await env.BUCKET!.put(key, await clean.arrayBuffer(), {
            httpMetadata: original.httpMetadata,
          });
          object = await env.BUCKET!.get(key);
        }
      }
    }
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

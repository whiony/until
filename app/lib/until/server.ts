import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw Error("Database unavailable");
  return env.DB;
}
async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
// These headers are provided by Sites dispatch, which is the authentication boundary.
// Never accept an account ID from JSON, query parameters, or the legacy device token.
export async function owner(req: Request) {
  const id = req.headers.get("oai-authenticated-user-id");
  const email = req.headers.get("oai-authenticated-user-email");
  if (!id || !email) throw Error("Unauthorized");
  const key = await digest(`until-account:${id}`);
  if (
    req.headers.has("x-until-account") &&
    req.headers.get("x-until-account") !== key
  )
    throw Error("Unauthorized");
  return key;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw Error("Forbidden");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Forbidden");
}
export async function legacyOwner(req: Request, account: string) {
  const token = req.headers.get("x-until-legacy-key");
  if (!token || !/^[-a-f0-9]{72}$/.test(token)) return null;
  const key = await digest(token);
  await database()
    .prepare(
      "INSERT INTO legacy_claims (device,account) VALUES (?,?) ON CONFLICT(device) DO NOTHING",
    )
    .bind(key, account)
    .run();
  const claim = await database()
    .prepare("SELECT account FROM legacy_claims WHERE device=?")
    .bind(key)
    .first<{ account: string }>();
  return claim?.account === account ? key : null;
}
export async function limitedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length")) > max) throw Error("Too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw Error("Too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "Unauthorized"
      ? 401
      : message === "Forbidden"
        ? 403
        : message === "Too large"
          ? 413
          : 503;
  return Response.json(
    { error: status === 503 ? "Service temporarily unavailable" : message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

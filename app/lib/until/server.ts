import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw Error("Database unavailable");
  return env.DB;
}
export async function owner(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[-a-f0-9]{72}$/.test(token)) throw Error("Unauthorized");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function failure(error: unknown) {
  const unauthorized =
    error instanceof Error && error.message === "Unauthorized";
  return Response.json(
    {
      error: unauthorized ? "Unauthorized" : "Service temporarily unavailable",
    },
    { status: unauthorized ? 401 : 503 },
  );
}

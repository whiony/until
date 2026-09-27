import { database, owner, failure } from "./server";
// Record commits and object collection share an account-scoped lease. This keeps
// a simultaneous save from adding a reference between the collector's check
// and its object deletion. A crashed request expires instead of blocking forever.
let initialized: Promise<unknown> | undefined;
export async function withAccountStorage(
  req: Request,
  fn: () => Promise<Response>,
) {
  let account = "",
    token = "";
  try {
    account = await owner(req);
    initialized ||= database()
      .prepare(
        "CREATE TABLE IF NOT EXISTS account_storage_leases (owner TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)",
      )
      .run()
      .catch((e) => {
        initialized = undefined;
        throw e;
      });
    await initialized;
    token = crypto.randomUUID();
    const claim = await database()
      .prepare(
        "INSERT INTO account_storage_leases (owner,token,expires_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at < ?",
      )
      .bind(account, token, Date.now() + 600000, Date.now())
      .run();
    if (!claim.meta.changes) {
      // Readers can use the committed snapshot while another request owns the
      // collector lease; they must not start a second collector.
      if (req.method === "GET" && new URL(req.url).pathname === "/api/sync") {
        const row = await database()
          .prepare("SELECT payload,revision FROM account_records WHERE owner=?")
          .bind(account)
          .first<{ payload: string; revision: number }>();
        return Response.json(
          {
            account,
            revision: row?.revision || 0,
            records: row ? JSON.parse(row.payload) : null,
          },
          { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
        );
      }
      return new Response("Storage is busy; retry sync", {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return await fn();
  } catch (e) {
    return failure(e);
  } finally {
    if (account && token)
      await database()
        .prepare("DELETE FROM account_storage_leases WHERE owner=? AND token=?")
        .bind(account, token)
        .run()
        .catch(() => {});
  }
}

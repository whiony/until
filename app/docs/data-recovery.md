# Until data recovery status

## What exists now

- Until writes records and supplied photo blobs together to the browser's IndexedDB before attempting account sync. The account JSON payload lives in Sites-managed D1 `DB` (`account_records`), while product and packaging photo bytes live in Sites-managed R2 `BUCKET` under `account/<owner>/<photo-id>`. Local recovery branches created after a conflict remain in that browser only.
- The Settings **Download your data** action creates a manual ZIP with `records.json`, `manifest.json`, and every photo referenced by the current records or saved local recovery copies. `manifest.json` contains sizes and SHA-256 hashes. The download fails rather than silently omitting a referenced image. Offline use works only when every referenced photo is already on this device. The old JSON-only export remains explicitly labelled as having no photos.
- A ZIP is a portable user copy, not an automated server backup. Neither device sync nor browser persistence protects against corruption/deletion propagated to other devices or loss of both D1 and R2.
- A visible page checks the account revision every 10 seconds and fetches the full JSON only when that revision changes or local edits need reconciliation. An unchanged check reads one D1 revision row, writes no lease, returns HTTP 304 with no body, and does not access R2. Local edits still save immediately and trigger sync. Failed sync attempts back off up to five minutes; opening, focus and reconnect prompt a new attempt. Hidden pages do not poll. Photo cleanup runs after a newly committed deletion and through a separate account-scoped maintenance request no more than daily. Failed maintenance attempts back off separately; maintenance does not certify a backup.

## Isolated recovery of a user ZIP

Run `python3 scripts/restore-portable-archive.py /path/to/until-data.zip /path/to/new-empty-directory`. The script refuses to overwrite an existing directory, validates archive paths, checks every photo association, size, and SHA-256 hash, then extracts only into the new directory. The application has no user-facing import; this extraction is for inspecting/recovering data and preparing a controlled import. The automated unit test restores representative current records and both product and packaging photo bytes into an isolated IndexedDB database and checks their associations. No production restore was run.

## Server backup blocker and required setup

The Sites connector available to this project can list the D1 binding/tables and deploy versions, but exposes no D1 export/restore, R2 object export/restore, independent backup destination, or backup schedule. `.openai/hosting.json` has only logical `DB` and `BUCKET` bindings. The presence of Cloudflare features for separately owned resources does **not** establish access for this Sites-managed project. Its server-backup frequency, retention, monitoring, and restore ability are **unknown**. Do not treat Until as the sole copy of irreplaceable data yet.

The owner or Sites operator must provide scoped read/export access to this project's D1 database and R2 bucket **and** a separate backup destination with write access, plus a way to schedule and observe jobs. If Sites cannot grant those capabilities, migrate the storage bindings to owner-controlled D1/R2 resources while preserving account IDs and R2 object keys. Before any cutover:

1. Inventory `account_records`, `device_records`, `legacy_claims`, `account_maintenance`, and all R2 `account/` and legacy photo prefixes without exposing payloads in logs. `account_storage_leases` contains short-lived locks; clear expired leases in an isolated restore rather than replaying them as active locks. Quiesce writes or take a consistent D1 snapshot paired with a versioned R2 object inventory.
2. Export D1 records and photo bytes to an independent, access-controlled destination. Encrypt at rest and restrict operator access. Include a manifest of account keys, object keys, sizes, checksums, and a snapshot time; never put credentials in the repository.
3. Configure a schedule and explicit retention policy (proposed starting point: daily backups retained for 30 days plus monthly backups for 12 months). Record each job's D1 row count, photo count, checksums, duration, and failure; alert the operator on a missed or failed run. These numbers are **proposed**, not currently active.
4. Restore a representative snapshot to separate D1/R2 resources and an isolated Site, verify record/photo associations, account isolation, and both active and History records, then document rollback. Only after this rehearsal may the production UI claim server backup coverage.

No automated server backup or destructive production restore has been configured by this repository change because the required infrastructure access is not available through the current Sites tools.

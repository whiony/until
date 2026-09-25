# Until

An English-language, offline-first expiration tracker. The TypeScript application is in [`app/`](app/).

## Run

Node 22.13+ required (Node 24 recommended).

```sh
cd app
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use an already-running server on port 5173. `npm start` serves the production build; only production builds generate the offline caching worker. The GitHub origin is preserved.

## Model and persistence

Reusable products are separate from owned groups. Dates, quantity, opening state, location, and completion status belong to groups. Add another starts fresh dates. Open one and Used/Discard one preserve the other units. The earliest printed or after-opening date controls; both source dates are retained. Dates are local calendar values. Calendar months clamp at month-end. Soon includes today through the configured horizon, inclusive; expired and undated items are separate. Best-before language refers to quality, not an automatic safety cutoff. Medicine reminders are neutral.

IndexedDB is the immediate source of truth. Each mutation reads current state, stores blobs and records in one transaction, increments a revision, and marks it pending. Transactions serialize concurrent tabs. The editor rejects a changed group instead of silently overwriting it. The retry service uploads immutable photo IDs to R2 before saving the referencing snapshot to D1. D1 accepts only newer device revisions. Pending edits are acknowledged only when the transmitted revision is still current. Duplicate and delayed requests cannot roll back the remote copy. Retries run on mutation, focus, reconnect and every 30 seconds while open. Pending work survives reloads.

A random device bearer key is stored in IndexedDB. Its SHA-256 digest namespaces D1 records and R2 photos. This is **anonymous device-scoped persistence**, not account recovery or cross-device sync, even when the private Sites access gate requires login. Clearing site storage loses the key and access to its remote copy. Sign-in does not clear local data. JSON export contains records, schema version, provenance, timestamps and photo references, **not photo bytes**. Future authentication needs an explicit claim/recovery flow and conflict handling. There is no destructive upgrade/reset behavior.

JPEG/PNG/WebP photos are limited to 12 MB. Packaging originals are preserved unchanged; product images are resized to 1200px JPEG. Photos are blobs locally and objects in R2, never base64 in database text columns. Missing photos use category icons.

## Barcode and OCR

One ZXing camera action handles retail barcodes with manual code entry and fallback. Camera permission is requested only on Scan barcode. Saved products take precedence over the provider. Open Food/Beauty/Pet Food/Products Facts return suggestions, separately confirmed by the user. No barcode invents a package date. Sources and licenses are shown in Settings and details.

The server sends an identified User-Agent, performs exact-code queries, caches results for 24 hours, and throttles requests per isolate. Add a distributed rate limiter before broad public launch; per-isolate limits are not a global API quota. The owner should submit the Open Facts API usage form before public launch; no external registration or message was sent on their behalf.

Tesseract.js reads the actual uploaded photo in the browser. Worker/WASM assets are hosted locally; language models download on first use and may be unavailable offline. English, German, French, Spanish and Croatian are selectable. OCR has no paid API dependency. Pixels are not sent to an OCR service, although saved photos are copied to the site's R2 store. Text/confidence and possible ISO/numeric dates are exposed; ambiguous numeric day/month order presents both interpretations. Only explicit confirmation or manual input changes a date/rule. English after-opening phrases are parsed; non-English duration instructions, month names, short years and poor print may require manual entry. PAO recognition and structured GS1 parsing are deferred.

Sources: [Open Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/), [licenses](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/), [Tesseract API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).

## Notifications — unavailable

This project's Sites tools/runtime expose HTTP Workers, D1 and R2, but no Cron Trigger/scheduled handler configuration. No VAPID credentials, push subscription store or delivery server is configured. `/api/notifications` returns `available: false`. The app never requests permission or claims alerts are enabled. Preferences persist: one daily digest, disable, lead time, optional expiration-day alert, time and quiet hours. They do not send notifications.

Smallest next step: provision a Worker with a Cron Trigger and VAPID key pair; add authenticated subscribe/unsubscribe routes and D1 subscription/delivery records; connect the `NotificationService` boundary. The scheduler must use current active records, combine reminders, apply timezone/quiet hours, deduplicate by device/local day/type, suppress edited/completed entries at send time, retry transient failures, and expire 404/410 subscriptions. Only then expose enablement, request permission on user action, and verify receipt while the installed iPhone app is closed. No client timer substitutes for push.

## Local database

Drizzle owns migrations. Sites applies them on production deploy. After a build, apply the generated SQL file locally once:

```sh
cd app
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/ACTUAL_MIGRATION.sql
```

## Deferred

Receipt import, waste analytics, shared households, voice, widgets, PAO-icon recognition, category-specific urgency (bread versus cosmetics), medicine GS1 DataMatrix workflows, full import/restore, complex lot tracking, authenticated multi-device recovery and sync.

## Verification — 2026-09-26

Passed: TypeScript, ESLint, production build, 18 Vitest tests, and 7 Playwright journeys against the built local Cloudflare Worker. Covered date precedence, month-end/leap-year rules, Soon boundaries, quantity splitting, used/discarded counts, repeat purchase groups, IndexedDB reload/concurrency, retry acknowledgement races, local/UTC midnight validation, offline shell/reload/edit, actual image OCR and explicit confirmation, original photo reload, camera denial, provider failure/manual fallback, unavailable notification states, D1 stale-revision/device isolation, and R2 image roundtrip/device isolation. Inspected desktop (1440px) and mobile (390px) screenshots and verified no mobile horizontal overflow.

Not verified on physical hardware: iPhone installation and camera capture. Live Open Facts availability/coverage and a successful physical barcode scan are not claimed as verified. OCR verification used a clean synthetic packaging label; real faded/curved labels remain variable. Push delivery was not tested because its infrastructure is absent. D1/R2 integration tests ran locally; a successful Sites deployment confirms publication, not a full production-device acceptance test.

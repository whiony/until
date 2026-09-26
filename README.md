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

IndexedDB saves edits immediately, including offline photos. Account data is namespaced using the authenticated Sites dispatch identity; client-supplied account IDs never grant access. The original device records, photos and bearer key remain intact. On first authenticated use, the old device snapshot is claimed once and merged into the account. Existing custom categories and locations remain selectable alongside built-in defaults.

Sync pulls on opening, focus, foreground, reconnect and every ten seconds while visible. Stable IDs prevent duplicate creation. Three-way merges combine independent record changes; server compare-and-swap revisions reject stale writes regardless of device clock. Concurrent changes to the same record stop with an explicit conflict rather than losing one device’s edits. Settings offers an export and an explicit cloud-copy choice that first archives the local branch. Recovery copies are included in recovery exports. JSON exports contain photo references, not image bytes. Photos remain in IndexedDB and account-isolated R2 objects.

JPEG/PNG/WebP uploads are limited to 12 MB and checked for image signatures. Product photos support square cropping during creation and later editing/replacement, using new immutable photo IDs. Packaging originals remain unchanged locally; cloud copies omit EXIF, comments and text metadata without re-encoding image pixels. Product crops are re-encoded. The separate packaging image is never replaced by a product crop.

Mobile uses a full-height, single-column editor with a scrollable body, fixed actions and visual-viewport/safe-area sizing. Package size remains optional descriptive text, independent of unit quantity.

## Barcode and OCR

One ZXing camera action handles retail barcodes with manual code entry and fallback. Camera permission is requested only on Scan barcode. Saved products take precedence over the provider. Open Food/Beauty/Pet Food/Products Facts return suggestions, separately confirmed by the user. No barcode invents a package date. Sources and licenses are shown in Settings and details.

The server sends an identified User-Agent, performs exact-code queries, caches results for 24 hours, and throttles requests per isolate. Add a distributed rate limiter before broad public launch; per-isolate limits are not a global API quota. The owner should submit the Open Facts API usage form before public launch; no external registration or message was sent on their behalf.

Tesseract.js reads the actual uploaded photo in the browser. Worker/WASM assets and the English model are hosted locally; other language models download from the Tesseract CDN on first use and may be unavailable offline. English, German, French, Spanish and Croatian are selectable. OCR has no paid API dependency. Pixels are not sent to an OCR service, although saved photos are copied to the site's R2 store. Text/confidence and possible ISO/numeric dates are exposed; ambiguous numeric day/month order presents both interpretations. Only explicit confirmation or manual input changes a date/rule. English after-opening phrases are parsed; non-English duration instructions, month names, short years and poor print may require manual entry. PAO recognition and structured GS1 parsing are deferred.

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

Receipt import, waste analytics, shared households, voice, widgets, PAO-icon recognition, category-specific urgency (bread versus cosmetics), medicine GS1 DataMatrix workflows, full import/restore, complex lot tracking, automated same-record conflict resolution and full photo export/restore.

## Verification — 2026-09-26 update

TypeScript, ESLint, production build and 24 unit tests pass. Account integration journeys use two independent browser contexts and the actual local Cloudflare Worker, D1 and R2. Only the platform’s trusted identity headers are supplied by the test harness; sync responses are not mocked. Coverage includes bidirectional creation/editing/status/photo transfer, offline reconciliation, existing-data migration, account isolation, stale-write rejection, cross-origin rejection, invalid image rejection, reload persistence and mobile crop/edit behavior. Metadata tests verify removal without changing original local bytes. Screenshots cover desktop, narrow mobile, detail actions and a reduced-height viewport simulating keyboard space.

Physical iPhone keyboard behavior, installation/Home Screen icon appearance, camera capture, and two real signed-in devices remain unverified. Local backend integration is not a claim of production-device acceptance. Actual OCR uses a clean synthetic label; real faded/curved labels vary. Push delivery remains unavailable because its infrastructure is absent.

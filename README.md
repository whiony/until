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

One ZXing camera action handles retail barcodes with manual product creation as fallback. Camera permission is requested only on Scan barcode. Saved products take precedence over the provider. Open Food/Beauty/Pet Food/Products Facts return suggestions, separately confirmed by the user. No barcode invents a package date. Sources and licenses are shown in Settings and details.

The server sends an identified User-Agent, performs exact-code queries, caches results for 24 hours, and throttles requests per isolate. Add a distributed rate limiter before broad public launch; per-isolate limits are not a global API quota. The owner should submit the Open Facts API usage form before public launch; no external registration or message was sent on their behalf.

Tesseract.js reads the actual uploaded photo in the browser. Worker/WASM assets and the English model are hosted locally; other language models download from the Tesseract CDN on first use and may be unavailable offline. English, German, French, Spanish and Croatian are selectable. OCR has no paid API dependency. Pixels are not sent to an OCR service, although saved photos are copied to the site's R2 store. Text/confidence and possible ISO/numeric dates are exposed; ambiguous numeric day/month order presents both interpretations. Only explicit confirmation or manual input changes a date/rule. English after-opening phrases are parsed; non-English duration instructions, month names, poor print and unsupported date formats may require manual entry. PAO recognition and structured GS1 parsing are deferred.

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

TypeScript, ESLint, production build, 33 unit tests and 19 browser/integration scenarios pass. Account integration journeys use two independent browser contexts and the actual local Cloudflare Worker, D1 and R2. Only the platform’s trusted identity headers are supplied by the test harness; sync responses are not mocked. Coverage includes bidirectional creation/editing/status/photo transfer, offline reconciliation, existing-data migration, account isolation, stale-write rejection, cross-origin rejection, invalid image rejection, reload persistence and mobile crop/edit behavior. Metadata tests verify removal without changing original local bytes. Screenshots cover desktop, narrow mobile, detail actions and a reduced-height viewport simulating keyboard space.

Physical iPhone keyboard behavior, installation/Home Screen icon appearance, camera capture, and two real signed-in devices remain unverified. Local backend integration is not a claim of production-device acceptance. Actual OCR uses a clean synthetic label; real faded/curved labels vary. Push delivery remains unavailable because its infrastructure is absent.

## Demo and editing refinements

“Try demo” opens a read-only presentation layer with stable fictional examples and local-calendar-relative dates. Demo mode resets off on reload. Demo fixtures are never written to IndexedDB or passed to sync, export or notification services; the repository additionally rejects demo IDs and the server accepts only UUID record IDs. Existing account sync continues independently. The demo yogurt image is an AI-generated fictional product photo, stored locally with the app; no user photographs are used in demos.

A name is sufficient to save. Undated items automatically appear in Needs a date. Invalid submissions open the relevant section, identify the error beside its control and focus that control without discarding photos or text. Quantity uses a numeric input mode; barcode remains text to preserve leading zeroes. Product fields use explicit non-contact names and autocomplete off. Mobile keyboard detection hides the large footer and description while typing, uses the native keyboard dismissal controls and scrolls only the form body to the active field. Actions return after dismissal.

“Recognize product” explicitly runs on-device OCR on the selected product image. It displays actual extracted text and an editable suggestion; only “Use suggested name” changes the entered name. Sparse-text segmentation and a temporary high-contrast working copy help tinted labels. The stored product and packaging photos remain unchanged. It does not infer brand or identity from visual appearance. English OCR assets are local; other languages require a first-use CDN model download. Unsupported/unreadable labels and unavailable models keep a manual path. There is no paid recognition API and no photo transmission for OCR. Normal account photo sync remains separate.

All-view counts distinguish physical units (sum of quantities) from separate date/location groups matching the selected filters. Cards represent those groups. The compact desktop Soon summary counts active units needing attention (expired, within the selected horizon, or undated), and all active units matching search/category/location. The original warm color tokens are restored. Empty states distinguish an empty shelf, no upcoming dates and filtered results.

## PWA installation checks and limits

The generated page links a versioned 180×180 PNG apple-touch-icon, a versioned manifest with 192/512 PNGs, and root Apple icon aliases. All icons have an opaque light-green background and safe padding. Automated checks verify response MIME types, dimensions, rendered metadata and alpha. Safari's share sheet in an iOS 18.4 iPhone 16 Pro simulator displayed the designed clock icon. The simulator test was stopped at the user’s request before a fresh Home Screen installation/software-keyboard check was completed; those are not claimed as verified. Further Simulator, Xcode and Computer Use testing is excluded unless explicitly requested. The production private site's icon/manifest requests returned HTTP 403 without authentication. That is a possible platform-access cause of a generic icon, not proof of the user's exact installation failure. Site privacy has not been weakened.

An existing iPhone Home Screen icon may retain its old artwork. After confirming your actual items are present and synced, remove only the old Home Screen shortcut and add the signed-in Until page again from Safari. Do not clear Safari website data. If a fresh installation still shows a generic letter, the private hosting asset access needs investigation; a desktop icon preview is not evidence that this is solved.

Apple documents the `apple-touch-icon` link in its [Safari web-app configuration guide](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html). WebKit documents [Visual Viewport support](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/); physical iOS behavior remains a separate acceptance check from viewport emulation.


## Form and recognition follow-up — 2026-09-26

The original `3747f57` typography is restored: Arial/Helvetica for controls and body, Georgia for major headings and the wordmark. The header uses a green `u` tile followed by `ntil.` with a single accessible Until label; the standalone clock icon remains for installation. Mobile filters use fixed two-column slots, including the longest status (Needs a date) and sort (Recently opened). Grid/List now displays the current mode beside sorting. The empty active shelf is independent of historical records. History cards and details describe Used/Discarded quantities, with no active-shelf or missing-date prompts.

The name comes first, followed by compact Scan barcode and dates/after-opening details. Manual barcode entry is removed; existing codes are preserved and visible in details. A captured code can be looked up or retried without blocking manual creation. Explicitly accepted lookup data fills name, brand, package size and a broad category based on the successful Open Food/Beauty/Pet Food/Products Facts source. A front photo is imported only when supplied, fetchable/valid and no selected photo already exists; it is not guaranteed. Saved-product matches reuse saved details/photo. The provider does not supply this package’s printed date, opening date/rule, location or owned quantity. Missing fields do not erase typed brand/size/name. Barcode API authorization and its exact-code query/cache/rate-limit behavior are unchanged.

Small keyboard-accessible help popovers explain ambiguous fields. Photo inputs still offer the device’s picker/camera and rely on native flash controls. Only the live barcode scanner exposes a torch, and only if its active video track advertises support. Closing or decoding turns off the torch and releases camera tracks, including error cleanup. Unsupported hardware has no inert light button.

The editor’s mobile overlay/background is now opaque cream instead of a dark backdrop underneath the native input accessory area. The redundant Done typing button is removed; viewport-based scrolling and footer hiding remain. Header and form respect top safe-area insets, with an iOS standalone fallback and a solid status-area cover while the page scrolls. CSS cannot style the native iOS keyboard/accessory bar. Physical iPhone behavior remains unverified; no Simulator, Xcode or Computer Use was used in this iteration. Approval settings are unchanged.

OCR uses actual pixels and the selected packaging language, independently of the English interface. Users can select the whole image, top half or bottom half. A bounded second pass uses contrast enhancement; numeric-date fallback restricts characters to digits/separators and exposes plausible candidates even at low confidence. Two-digit years generate possible day/month/year and year/month/day interpretations in 2000–2099, always requiring confirmation. There is no identity guessing, external photo-recognition upload, new paid service or dependency. Product OCR uses the pre-square-crop image during the editing session; Keep full photo avoids clipping names in saved photos. Canceling replacement retains the prior recognition source. Existing cropped photos cannot recover already discarded pixels.

### Supplied screenshot experiment

Only screenshots (not their original camera files) were supplied. Local temporary crops extracted the visible image areas; they are not committed, deployed or sent to a provider. On the 396×294 packaging region, the old date pipeline returned no text/date. In the new browser pipeline with Top half selected, it read `20-06-27` and offered `2027-06-20` and `2020-06-27` for explicit confirmation (low 18% combined OCR confidence). This does not prove which date is intended. On the visible cropped product-logo region, the old and new pipelines returned `LA`, with no usable candidate; the screenshot’s earlier `SVIGKERS` output cannot be reproduced without its original image. Full-photo capture now prevents additional cropping, but Tesseract does not reliably read this clipped/stylized logo. The next practical step is a clear uncropped close-up or barcode; a separate vision service would need explicit approval and an evaluation before uploading photos.

The read-only Memorate reference uses the same viewport/Apple web-app flags, plus root Apple icons and 152/167 variants. Until now supplies these additional sizes, a root versioned 180 icon and version-4 manifest PNGs, all with its own light-green clock artwork. Local production HTTP checks cover metadata, MIME, dimensions and opacity. The known unauthenticated private-site asset 403 remains a possible Home Screen icon limitation; references cannot bypass platform access control, and site privacy is unchanged. A fresh physical iPhone installation is still required to establish the outcome.

Follow-up verification includes fixed mobile filter geometry at 320px, a simulated 59px top inset, both desktop layouts with nine demo cards, Used and Discarded history, help and form ordering, real EAN-13 decoding from a generated video frame, mocked supported torch constraints/track release, lookup failure/retry and explicit prefill, short-year ambiguity, and all prior sync/offline/photo tests. The legacy fixture now seeds IndexedDB before loading app code; it no longer races initial account setup. Physical camera light, native keyboard surfaces and installed Home Screen appearance remain device acceptance checks.

### Card and icon polish — 26 September 2026

Cards share identity/status/date/action rows; desktop List uses bounded, compact columns and adapts at 1100px. Phones always use standard cards and hide the view toggle. Display-only English calendar formatting (`26 Sep 2026`) leaves stored ISO dates and arithmetic untouched. Detail metadata values are lowercase; filter copy is title case. Expired active details use a peach panel and desktop Edit spans the action area. Field help and optional-section dividers have additional spacing.

The U favicon is the source for SVG/16/32px browser icons, 152/167/180px Apple icons, and 192/512px manifest icons (version 5). Opaque backgrounds and generous padding support maskable cropping. Build regenerates assets and the content-hashed service worker. Local unauthenticated asset routes work. Production Sites dispatch still returns HTTP 401 HTML for anonymous icon/manifest requests; the same URLs return 200 assets with the documented authorized header. The available Sites access controls provide no per-asset anonymous exception. Site privacy was preserved: installing before sign-in remains blocked by the hosting layer, not fixed by versioned URLs. A real signed-in Safari session and physical Home Screen icon remain unverified. After verifying account sync/export, remove the old Home Screen shortcut, reload the updated site in signed-in Safari, and add it again; do not clear site data merely to refresh an icon.

Validation: 34 unit tests, full existing browser suite plus responsive checks at 320/390/760/800/1024/1440/1920px, typecheck, lint and production build. Real iPhone checks: keyboard scrolling, safe-area behavior, native picker/camera/torch, and freshly installed Home Screen icon. No Simulator, Xcode or Computer Use used.

### Quick Add item flow — 26 September 2026

Creation now uses a single-line product name, compact optional barcode scanning, and immediately available product/label photos. Dates are optional and Date type names the label meaning. New category/location values are empty; existing values and custom choices are retained. Quantity, location, category, brand, purchase date, package size and notes are available under More details. Disclosure arrows and aria-expanded follow the actual open state.

Printed, purchase and opened dates use a staged native date picker: opening it starts from the saved value, native changes affect only a draft, Apply date commits, Cancel/Escape/outside dismissal discard the draft, and Clear date explicitly clears. This avoids treating a native picker’s default today value as a saved date merely on dismissal. Empty triggers show Add a date. No date arithmetic or stored schema changed.

The introduction scrolls with the fields; only a compact title/close header and short safe-area footer remain fixed. Mobile uses one Add action; closing a changed editor asks whether to discard unsaved details/photos. Desktop width is bounded at 720px with grouped related columns and adjacent actions. Help is attached to labels; image limits are contextual, and selecting the same file after cancelling crop works again. Upload validation, compression/metadata handling, account isolation and APIs are unchanged.

Browser coverage checks explicit date confirmation/cancellation/clearing, unset defaults, name-only cloud records, disclosure states, preservation through help/crop/photo selection, close warnings, compact controls, scrolling introduction and 320/390/1440px layouts. Real iPhone Safari/Home Screen still needs verification for the native picker, keyboard viewport, safe areas and file/camera picker. Simulator, Xcode and Computer Use were not used.

Validation for this flow: 34/34 unit tests and 24/24 full browser/integration tests passed; typecheck, lint and production build passed. Responsive screenshots at 320/390/1440px and a 390×440 keyboard-sized viewport were inspected. Browser tests await crop completion, viewport updates and completed saves before reload.


### Shelf screens and recorded History events — 26 September 2026

Soon, All items and History share compact spacing and coherent content boundaries. Phones retain single-column cards, a slim sticky safe-area header and a 44px plus-only Add item action. The final card clears the bottom navigation. Desktop List aligns identity, countdown/date and the action in bounded columns; quantity appears once in the information area. Grid/mobile quantity remains only in the footer. Active cards use a visibly styled Mark one as used button; existing quantity limits and split-record behavior remain intact.

Counts explicitly distinguish physical units from record groups. All items displays its count once beside Your shelf; Soon displays the configured horizon once in its description. Navigation badges and attention summaries count units. Empty History has no Clear filters action; filters excluding existing records expose it. History search refers to used/discarded items.

New use/discard actions record an optional completedAt timestamp, accepted by the existing authenticated sync schema. Most Recent History sorts by that actual event timestamp. Existing records are not backfilled from updatedAt: unknown dates stay blank and sort after recorded events. Used and Discarded are distinct; Add again creates an active item while preserving the historical record. No dependency, authorization, sharing or photo-processing changes were introduced. The Add item form was not redesigned.

Validation: 36 unit tests and 26 full browser/integration scenarios, TypeScript, ESLint and production build pass. Tests cover event-date sync/reload, legacy unknown dates, sorting, Add again preservation, quantity boundaries, empty/filter distinctions, count semantics, configured horizons, navigation, and responsive layouts at 320/390/760/800/1024/1440/1920px. Real-device acceptance remains for Safari and installed PWA safe areas, sticky scrolling, search keyboard behavior and bottom navigation around the home indicator. No Simulator, Xcode or Computer Use was used; approval settings and private audience are unchanged.

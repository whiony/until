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

Printed, purchase and opened dates now use the single calendar interaction described in the form-control follow-up below. The previous staged native-input layer has been removed. Empty triggers show Add a date; date arithmetic and the stored ISO schema are unchanged.

The introduction scrolls with the fields; only a compact title/close header and short safe-area footer remain fixed. Mobile uses one Add action; closing a changed editor asks whether to discard unsaved details/photos. Desktop width is bounded at 720px with grouped related columns and adjacent actions. Help is attached to labels; image limits are contextual, and selecting the same file after cancelling crop works again. Upload validation, compression/metadata handling, account isolation and APIs are unchanged.

Browser coverage checks explicit date confirmation/cancellation/clearing, unset defaults, name-only cloud records, disclosure states, preservation through help/crop/photo selection, close warnings, compact controls, scrolling introduction and 320/390/1440px layouts. Real iPhone Safari/Home Screen still needs verification for the native picker, keyboard viewport, safe areas and file/camera picker. Simulator, Xcode and Computer Use were not used.

Validation for this flow: 34/34 unit tests and 24/24 full browser/integration tests passed; typecheck, lint and production build passed. Responsive screenshots at 320/390/1440px and a 390×440 keyboard-sized viewport were inspected. Browser tests await crop completion, viewport updates and completed saves before reload.


### Shelf screens and recorded History events — 26 September 2026

Soon, All items and History share compact spacing and coherent content boundaries. Phones retain single-column cards, a slim sticky safe-area header and a 44px plus-only Add item action. The final card clears the bottom navigation. Desktop List aligns identity, countdown/date and the action in bounded columns; quantity appears once in the information area. Grid/mobile quantity remains only in the footer. Active cards use a light Mark one as used action; existing quantity limits and split-record behavior remain intact.

Filtered sections count visible records with item/items; physical-unit totals remain in the overall summary and navigation badges. Unfiltered sections omit repeated counts; Soon displays the configured horizon once in its description. Navigation badges and attention summaries count units. Empty History has no Clear filters action; filters excluding existing records expose it. History search refers to used/discarded items.

New use/discard actions record an optional completedAt timestamp, accepted by the existing authenticated sync schema. Most Recent History sorts by that actual event timestamp. Existing records are not backfilled from updatedAt: unknown dates stay blank and sort after recorded events. Used and Discarded are distinct; Add again creates an active item while preserving the historical record. No dependency, authorization, sharing or photo-processing changes were introduced. The Add item form was not redesigned.

Validation: 36 unit tests and 26 full browser/integration scenarios, TypeScript, ESLint and production build pass. Tests cover event-date sync/reload, legacy unknown dates, sorting, Add again preservation, quantity boundaries, empty/filter distinctions, count semantics, configured horizons, navigation, and responsive layouts at 320/390/760/800/1024/1440/1920px. Real-device acceptance remains for Safari and installed PWA safe areas, sticky scrolling, search keyboard behavior and bottom navigation around the home indicator. No Simulator, Xcode or Computer Use was used; approval settings and private audience are unchanged.


### Add item shared-control follow-up — 26 September 2026

Interactive boundaries now belong to the visible buttons and inputs. Label rows are plain containers; actual text labels focus their associated text inputs. Photo buttons have equal heights and short Choose photo copy, with distinct Product photo and Label photo headings. Help buttons have bounded 32px targets, short purpose-specific English explanations, one active explanation at a time, repeat-click toggling, outside/Escape dismissal and collision-aware positioning. Scrolling hides an explanation when its trigger leaves the form’s visible area.

All three dates share a keyboard-accessible calendar with month/year navigation. Selecting a day commits its ISO date and displays `25 Sep 2026`; Clear date explicitly clears. Navigation and Escape/outside dismissal preserve the prior value. Opening an unset calendar never saves today. There is no second editable date field or Apply/Cancel layer. The existing installed calendar dependency is reused without dependency changes.

The after-opening amount and capitalized Days/Weeks/Months selector share one duration label. Selecting a unit with no amount does not create a rule. Date type options use Unspecified, Best before and Use by without changing stored values. The deadline explanation appears once in the section. Product name receives no initial focus; text controls use non-contact names and autocomplete off. The action bar hides during detected keyboard entry and returns with values preserved. Section expansion scrolls only the form body when its heading/first field would be hidden, respects reduced motion and never focuses Quantity.

Verification: separate feature scenarios cover help toggle/exclusivity/dismissal, pointer and touch boundaries, all date fields and synced ISO values, empty and populated duration semantics, photo selection, disclosure visibility, initial focus and keyboard-sized viewport restoration. Narrow browser checks at 320/390px include touch-enabled calendar/help interaction; desktop captures cover 1440px. These are browser simulations, not a physical iPhone test. Actual Safari/Home Screen keyboard appearance, the system AutoFill Contact bar, visual-viewport behavior, safe areas and the native photo/camera chooser remain device checks. No Simulator, Xcode or Computer Use was used.

Security review covers the exact pushed diffs. Account authorization/isolation, API routes, upload validation/compression/metadata stripping, database schema, dependency manifests and private audience are unchanged. Tests use separate fictional accounts; supplied screenshots and personal photos are not committed or deployed.

Final validation for this follow-up: 8/8 separate form/OCR scenarios and 2/2 updated regression scenarios, 36/36 unit tests, 31/31 full browser/integration scenarios, TypeScript, ESLint and production build passed.


### Card and item-detail refinements — 26 September 2026

Grid cards use natural content heights with a full-width countdown below photo/identity. The shared subgrid rows no longer reserve empty space. The shelf can use a wider desktop content area, and tablet List rows keep bounded columns. History is compact: Used/Discarded appears once; quantity appears only for multiple units. Card actions have transparent backgrounds, 44px touch targets, and explicit hover, pressed, focus and disabled states.

Item details compose product media beside identity/status on desktop and stack at narrow widths. Portrait, landscape and square product images are contained; fallback illustrations remain small. Original packaging/evidence media and crop/blob data are unchanged. Details retain recorded dates, rules, opening deadlines, completion dates, purchase dates and barcode; absent historical rows and the repeated history notice are omitted. Add again creates a fresh item without changing history. Detail actions use equal columns and full-width final odd actions; mobile stacks them. Initial focus stays on the dialog without scrolling the overview away.

The mobile header and fixed safe-area guard are opaque, remain above scrolling content and below modal overlays. The plus-only Add item action is a 44px circle aligned with adjacent controls. Safe-area scrolling was checked on Soon, All items and a long History list. Tests use fictional accounts and generated test images; no supplied personal photos or screenshots are saved in the repository.

Verification: 3 new feature scenarios cover filtered singular/plural record counts, distinct unit totals, historical quantity/status variants, card-action isolation, detail Add again/history preservation, photo composition/evidence bytes, and fast scrolling/safe-area layering. Existing display/shelf regressions were updated to the requested behavior. Final checks: 36 unit tests and 34 full browser/integration scenarios, typecheck, lint and production build. Desktop Grid/List and 320/390/760px mobile screenshots were inspected, including portrait/landscape/square media, fallback details and scrolled headers. Physical iPhone Safari/Home Screen, native status-bar compositing and rubber-band scrolling remain unverified; Simulator, Xcode and Computer Use were not used.

Exact push diffs were reviewed for secrets/personal data, account isolation/authorization, uploads/metadata, APIs and dependencies. API routes, sync/storage schemas, photo validation/metadata handling, dependency files and the private audience remain unchanged.

### Add item semantics and keyboard follow-up (iteration 10)

The shared editor label row now reserves 32px for both plain labels and rows with help buttons. Category/Brand, Quantity/Location and Purchase date/Package size align without field-specific offsets; the mobile breakpoint still stacks the fields. Dates no longer has a visible or accessible “optional” section suffix. Product name retains its asterisk and required attribute. Quantity still defaults to 1 and keeps the existing integer validation (1–9999), but no longer advertises a second mandatory field through native `required`.

The production-rendered DOM was audited before and after the changes, not just React props. The original form already owned all text/number fields, had `autocomplete="off"`, and contained no nested form or contact tokens (`name`, `given-name`, `family-name`, `email`, `tel`, address fields). Product name already used `until-product-name`; Brand, Package size and Notes also had item-specific names. Thus no demonstrated personal-information token explains the iPhone suggestion. A heuristic classification based on the word “name”, or iOS keyboard UI independent of autofill attributes, remains a hypothesis, not a verified cause.

The editor now has a stable `until-item-form` owner and item-entry name. Product name, Brand, Package size, Notes and custom Category/Location explicitly request the text keyboard; Quantity and after-opening duration remain number inputs with `inputmode="numeric"`. Custom fields have stable item/product-specific IDs/names and implicit accessible labels. The duration has an explicit visible label association. Radix choice triggers have stable IDs and visible-label references excluding help-button text; their existing visually hidden native selects now receive the item-specific name and standard `autocomplete="off"` through the Select root. Date triggers remain named, accessible buttons (no text/date input or contact autocomplete token). File inputs have stable item-specific IDs/names, remain `type="file"`, and retain their accessible names and MIME filters; autocomplete/inputmode do not apply to those controls. No decoy inputs, randomized names or nonstandard autocomplete tokens were introduced. React state, validation, sync records and photo upload processing remain the saving path.

A read-only comparison with the local Memorate PWA found the same viewport-fit cover, initial scale, standalone display and default Apple status-bar settings. Its editor uses a 96dvh sheet, a normal scrollable form and a footer outside the form, without visualViewport keyboard handling. Its page, sheet and inputs use warm opaque surfaces; it has no CSS making the native keyboard translucent. Until instead sizes its opaque editor to the visual viewport, hides the footer during typing and scrolls focused fields into that visible region. Until also painted a redundant opaque fullscreen dialog overlay and body override beyond the resized form. During keyboard-open mobile editing that overlay is now transparent and the body returns to its usual page background. The form itself remains opaque/readable, safe-area handling and field scrolling remain intact, and Add item stays hidden while typing. The supplied screenshots focus different fields (Memorate Comment versus Until Product name), so they do not isolate a keyboard-style or autofill cause. App-owned layering is corrected; any change to native blur/keyboard material is unverified.

Physical iPhone recheck, in both Safari and the existing Home Screen installation: Product name, Brand, Package size, Notes, Quantity, Use within after opening, Custom location and Custom category. Separately open Printed date, Opened date and Purchase date and choose Date type, Duration unit, Location and Category to confirm they remain pickers rather than typing fields. Compare Until Notes with Memorate Comment as well as the respective title/name fields on the same phone. Check accessory/keyboard backdrop, switching fields, scrolling the focused field, hiding/restoring the keyboard and the absence of a floating Add item button. No physical iPhone, Simulator, Xcode or Computer Use was accessed. Neither removal of AutoFill Contact nor native keyboard translucency is claimed. Apple describes contact autofill as Safari UI; the HTML standard allows user-agent/user-preference overrides: [Apple guide](https://support.apple.com/guide/iphone/fill-in-forms-iphccfb450b7/ios), [HTML autofill standard](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill).

Focused browser tests inspect actual form ownership, input and Radix native-select attributes, required indication, accessible label associations, custom values, validation and synced records. Geometry checks cover 320/390/760/800/1024/1440px; a separate mocked visualViewport shrink/offset test checks layering, focused-field reachability, hidden footer and value restoration. This verifies web behavior only, not iOS rendering.

Final iteration-10 validation: 36 unit tests, all 37 browser/integration scenarios, typecheck, lint and production build passed. Desktop/mobile alignment captures and the mocked keyboard geometry were inspected. Security review of each exact push covers secrets/personal data, authorization/account isolation, uploads/image metadata, exposed APIs and dependencies; changes are limited to editor HTML/CSS, tests and this audit. Those backend and dependency boundaries are unchanged, and no user screenshots, photos or account records are included.

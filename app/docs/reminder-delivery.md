# Reminder delivery status and setup

As of this change, Until does **not** deliver notifications with the app closed.
`GET /api/notifications` requires the existing authenticated Sites account and returns
`available: false`. The browser checks Home Screen installation on iOS, Web Push API
support and denied permission without requesting permission. No subscription is
created, no push endpoint or private credential is stored, and no browser timer
pretends to be a scheduler. Saving preferences is explicitly separate from enabling
notifications. Soon and passed-date views remain available.

## Confirmed deployment blockers

The current Sites project has D1 (`DB`) and R2 (`BUCKET`), but no runtime variables
or Web Push/VAPID credentials. The available Sites connector and publishing
configuration do not expose a schedule-creation operation or documented Cron
Trigger wiring. The generated Worker exports the framework fetch handler; adding
an arbitrary cron key to the hosting manifest is not an authorized supported
configuration. There is no existing authenticated external scheduler or Cloudflare
account deployment configured in this repository. A site metadata field mentioning
schedule request IDs does not provide a callable scheduling capability.

A service worker alone cannot wake itself at a chosen time while the app is closed.
The current worker intentionally has no unconnected push listener. Neither a mock
permission response nor tests of the scheduling policy establish real delivery.

## Concrete next setup

1. Obtain supported Sites server scheduling **and** a service identity for those
   scheduled invocations, or explicitly authorize a dedicated Cloudflare Worker
   with Cron Triggers and an authenticated connection to the account record store.
   Do not reuse a user's Sites sign-in/bypass token for a background job.
2. Generate a persistent VAPID key pair. Configure the private key and sender
   contact as runtime secrets; expose only the public key. Choose and configure a
   standard Workers-compatible Web Push sender, with a reviewed pinned dependency.
3. Add an authenticated, same-origin subscription API and D1 migration. Each row
   belongs to the authenticated account and one device, with endpoint + push keys.
   Never accept an account ID from request JSON. Validate length and vendor HTTPS
   push endpoint destinations, reject credentials/private or arbitrary URLs, and
   keep endpoints/keys out of logs and client record exports. Devices subscribe
   only after the user chooses Enable and permission is granted. An existing local
   subscription is not sufficient: confirm ownership in the server store. Disable
   removes that device's account subscription. Switching accounts detaches/rebinds
   through authenticated operations; never deliver the previous account's data.
4. Execute the scheduled Worker regularly, read current account records immediately
   before sending, and use `lib/until/reminder-plan.ts` for the daily digest policy:
   effective date = earlier applicable printed/opening date, saved IANA timezone,
   digest time, quiet hours, lead window and optional due day. Do not send historical,
   undated, fully used/discarded or Demo items. Recomputing cancels/reschedules
   changes automatically. Persist delivery claims keyed by account, local calendar
   day **and device subscription** in D1 with a unique constraint. Use bounded
   retries, remove expired subscriptions on 404/410, and document timeout ambiguity;
   do not promise exactly-once delivery across a remote push service. Default is
   at most one digest per device per day. Choose a digest time outside quiet hours;
   a digest is deferred while quiet hours are active, without backfilling old days.
5. Add the SW push/notification-click handlers only with this working sender.
   Keep notification text generic (“Your shelf has dates to check”), omit names,
   notes, photos, barcode and personal data from lock-screen payloads; navigation
   opens authenticated Until. Report permission, registered per-device subscription
   and server delivery health separately. Saving preferences must never say Enabled.
6. Test authenticated subscriptions and rejection of cross-account/cross-origin
   mutation, scheduling cancellation, dedupe and retries against real persistence.
   Receive a real test push after closing the installed PWA on iPhone and another
   supported browser. Then test a scheduled reminder while the PWA is closed,
   a date/status change before dispatch, timezone/DST and another account/device.
   Record received delivery independently of mocks and unit tests.

Policy and device-detection tests in this change are preparation, **not an end-to-end
push implementation**. Actual closed-app delivery and iPhone receipt are blocked
until the infrastructure above is configured.

References: [WebKit iOS Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

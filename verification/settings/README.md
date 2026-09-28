# Settings browser verification

These screenshots were captured from the final Until build by `tests/e2e/settings-sync-data.spec.ts` on 2026-09-28. They show synthetic test data on local Wrangler D1/R2, not a production account or an iPhone simulator.

- `desktop-1440.png`: 1440 × 1000 viewport, full-page capture.
- `mobile-390.png`: 390 × 844 viewport, full-page capture.
- `mobile-320.png`: 320 × 700 viewport, full-page capture.

The fixed mobile navigation appears partway down each full-page image because it remains pinned to the viewport while the entire scrollable page is captured. Browser assertions also verified no horizontal overflow at 390 and 320 pixels.

Final verification: `npm test` 63/63, `npm run test:e2e` 65/65, `npm run typecheck`, `npm run lint`, and `npm run build` passed. Browser tests ran against the built Worker with local persisted D1/R2; they did not test production backup permissions or a real iPhone.

# FB01 engineering verification

This fictional engineering slice is not the complete game, the original 244 acceptance tests, a human experience study, or a real military model.

## T01 — safe start (#2)

- Baseline: `6df6a8a6a8c64a23902978beff53db26f4a5c5b1`; independent Standards/Spec review included all new files via staged diff, not an empty HEAD-only comparison.
- Public creation test: red (`not implemented`) → green. Creation idempotency: red (two run IDs) → green (same committed snapshot; conflicting mode rejected).
- Three Vitest public-interface tests pass: creation, retry, invalid definition rejection. These use fake IndexedDB and do not prove browser storage.
- Actual Edge/Chromium browser: two tests pass using the built Docker static image, real Worker, Dexie/IndexedDB and Web Locks. Second page is denied while the first writer is alive; reload lists the committed run. Malformed IDs, identity override and null messages are rejected without breaking subsequent requests.
- Malformed real Worker test initially timed out because null input broke error handling; runtime exact-field/type validation fixed it. A separate first-run socket failure was static container readiness, corrected by explicit HTTP readiness rather than test retries.
- Strict TypeScript and container build pass. Both independent review axes found one issue; both were fixed and independently re-reviewed with no remaining serious T01 finding. Reviewers did not independently rerun tests.
- Static image: `fogbound-fb01:t01`, image config SHA256 `90c4370971ba7b7cf3f7b044731977a8b721bdc6d534625936d7bcaf7f7801ae`; actual worker entry `worker-CwdXqCf7.js`. Service stop caused new HTTP timeout; restarting the same image on the same origin restored access. Already-loaded pages are not described as paused by server stop.
- Node22 image digest `43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`, Node22.23.3. Fresh npm10 install hit an optional-peer resolver error; npm11.6.2 generated the lock in the container, then Docker npm10 `ci` from that lock succeeded.

Commands: `npm test -- tests/start.test.ts`; `npm run typecheck`; `docker build -t fogbound-fb01:t01 app`; `node app/node_modules/@playwright/test/cli.js test --config=app/playwright.config.ts browser/start.spec.ts` with an existing local Edge executable, or bundled Chromium in CI.

T02—T07, final batch CI, target production/ARM, real disk quota/eviction and human experience are not yet verified. Original 244AT remains not_run.

## T02 — report/map and safe preview (#3)

Public preview: red NOT_IMPLEMENTED → green independent 120/31800/1000 oracle and unchanged committed state. Existing T01 and T02 kernel tests: four pass. Final static T02 image config `e86038a320dbe1b9f387dfa1e70043b10c804db3f47ad154bbf22205a16f82a5`; all six current browser tests pass. Typecheck, build and UI/core import boundary pass. A large Pixi/milsymbol chunk warning remains; no external runtime assets are required.

Browser evidence covers 1366×768, 1920×1080, report/map selection, keyboard target selection, drag on markers, pointer cancellation, wheel anchor error below 0.1 fictional metre, local reason preservation, cancel without task registration, distinct H/R labels with leader lines, and menu wheel isolation. A separate computed-font-size ×2 accessibility probe confirms controls remain reachable; it is not a claim of browser zoom/DPR testing. Screenshots remain local ignored test artifacts.

Standards review initially found menu wheel zoom and stale preview failure handling; Spec independently found stale preview failure handling. Real Transport-seam delayed failure and menu-wheel regressions each went red then green. Success/error/catch/finally now use the same run/revision/editing-seq guard. Map geometry and displayed Plan estimates come from committed legal fields. Both independent axes re-reviewed the fixes with no remaining serious T02 finding; reviewers did not rerun tests.

T03—T07 and final batch CI remain pending; the original 244AT remains not_run.

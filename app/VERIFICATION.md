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

## T03 — committed movement and legal feedback (#4)

Public Game movement tests establish the independent 1000/2000/7000/32800/33800 timeline, known fixes, eight R sends, final resources 8/92/18, original-ID retry, changed-content rejection, single-task eligibility, and equal causal feedback/ledger for large and boundary steps. Deadline cases 567199, 567200, 567201 and acceptance at the endpoint are covered. Eight kernel tests, strict typecheck and import-boundary checks pass. Nine actual Edge browser tests pass against final static image config SHA256 `fdbab68dd8506711a9b67ebb57d81b444c0aa9bd0f8df096057bc471930b704e` (`worker-BJcZGPPb.js`).

Both independent axes found completion exactly at deadline and inability to re-confirm a definitively rejected plan. Each regression was observed red before the fix, then green. Completion must precede deadline; definite rejection releases the pending frozen envelope for a new explicit confirmation, while uncertain outcomes retain the original ID. Reason and plan remain editable. Standards also identified duplicated profile constants; movement now consumes validated definition values. Both axes re-reviewed with no remaining serious T03 finding; reviewers did not run tests themselves.

Player wording has a separate browser regression covering start, normal pages and writer denial; it does not claim final all-page coverage before save/replay exist. T04—T07, visual one-to-one final acceptance and GitHub CI remain pending. Original 244AT remains not_run.

## T04 — live clock and confirmed management pause (#5)

Twelve kernel tests, strict typecheck, import-boundary checks and thirteen actual Edge browser tests pass. Final static image config SHA256 `7ff58afed90536ed52c2b0a8a362cf34cea125643fd31771f22516606d120430` (`worker-CA1C-KPV.js`). Public controls record pause/continue/rate/mode rejection, original-ID receipt retry and research positive-only advance. Worker tick targets and control-adopted clock targets are recorded for later replay; the 7250ms between-tick control regression was red (7000), then green. Clock duration follows wall-time anchors and public 1/2/4 rates, not render frames. Browser measurements allow 600ms observation tolerance and remain engineering evidence.

Reading keeps time advancing. Manual pause and actual blur/visibility pause stop committed SimTime after receipt; returning focus does not resume. Playwright normally forces focus emulation (`playwright-core/lib/server/chromium/crPage.js`); the focus test disables that setting and verifies actual lost focus rather than dispatching a synthetic DOM event. Both headed and headless focus paths passed locally.

Independent reviews found live plans aging during editing, lost management pause during an existing control, and unconfirmed control state clearing early. Normal command editing/confirmation and a real Transport-seam held rate receipt plus actual tab switch each went red on the prior static image, then green. Explicit confirmation now rechecks identical visible conditions through public preview before freezing the current version; changed conditions return to preview. Definite stale requests may be rechecked finitely; uncertain results retain the original ID. Deferred pause waits for the original control and then sends its own intent; pending status survives uncertain outcomes. Both review axes re-reviewed with no remaining serious T04 finding, without independently rerunning tests.

T05—T07, final visual matching and GitHub CI remain pending. Original 244AT remains not_run.

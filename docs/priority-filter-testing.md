# Priority feature implementation and verification

## Implementation plan completed

1. Preserve the existing storage key, record fields, legacy Medium fallback, and successful submission flow.
2. Keep business rules in `src/request-store.js`: validation, category precedence, date ordering, draft delays, availability matching, duplicate aging, recovery, and closure.
3. Use `src/app.js` for form draft capture, persistence errors, separate category sections, recovery selection, and Close request controls. Keep the existing form and styling; add only category/action styles.
4. Record the user's approved clarifications in `docs/priority-filter-spec.md`.
5. Add controlled-clock tests and an isolated browser fixture, then run the existing regression suite and browser checks.

## Run automated tests

From the repository root, run `npm test` (the package script is `node --test`). No dependencies need installation. If npm is unavailable but Node.js is installed, run `node --test` directly.

Verification performed: `node --test` passed all 31 tests, including the eight unchanged existing tests. `node --check src/app.js` and `node --check src/request-store.js` passed. npm itself is unavailable in the verification runtime, so the equivalent package-script command was used directly.

The test files use Node's built-in test runner and in-memory storage. They do not modify the browser's real requests. Clock boundary tests check the instant before and at 72 hours and 14 days without waiting for real time to pass.

## Browser verification setup

1. Start the application with `npm start` or `node scripts/serve.mjs`.
2. Use `http://127.0.0.1:8000/index.html`. On Windows the existing server's root URL may return Not found; the explicit index path works. The server was not changed as part of this feature.
3. For sample data, use a separate port to protect real browser data. In PowerShell, set `$env:PORT='8007'`, then run `node scripts/serve.mjs` in that terminal. Open `http://127.0.0.1:8007/tests/priority-fixture.html` and choose Load test fixtures. This intentionally replaces only this test origin's request storage.
4. The fixture provides all nine sections, a legacy request without priority, a newly identified duplicate, a duplicate identified more than 14 days ago, overdue incomplete attempts, ordered Low requests, and literal HTML-like text for safe-rendering verification.

## Acceptance criterion coverage

| Criterion | Automated test / reproducible check | Observed result |
| --- | --- | --- |
| AC-01 | Run the legacy migration, unknown-field preservation, and original round-trip tests. Load browser fixtures and reload. | Passed; existing data and unknown metadata survive, and the legacy request appears as Medium. |
| AC-02 | Run the category-order test. Inspect the fixture's headings. | Passed; High, Unavailable, Failed, Medium, Invalid, Low, Duplicate, Discarded, Closed appear in order. |
| AC-03 | Run High-overlap tests, including delayed High attempts. Inspect High request in the fixture despite an equipment/date conflict. | Passed; High wins once the record is manager-visible. |
| AC-04 | Run precedence and Low-duplicate exception tests. Inspect Original request under Unavailable and Active duplicate under Duplicate. | Passed; Low bypasses Unavailable only for eligible duplicates; Failed and Invalid retain their specified precedence. |
| AC-05 | Run date-order tests. Inspect Low earlier before Low later in browser fixtures. | Passed; earliest needed date first. |
| AC-06 | Run date-order tests with missing, invalid, and tied dates. Inspect Failed older before Failed newer. | Passed; dated records first, then undated oldest first; creation ties use IDs. |
| AC-07 | Run draft persistence, visibility, edit-reset, and High-delay tests. Type a partial request, leave, reload, and verify restoration without manager-list visibility. | Passed; drafts persist and stay hidden before 72 hours. Exact expiry is verified with the controlled clock; aged fixtures verify browser rendering. |
| AC-08 | Run incomplete-submission delay tests. Enter only a requester, choose Add request, and reload. | Passed; the attempt is retained, remains hidden during the delay, and restores into the form. |
| AC-09 | Run invalid-field, real-date, department, and length tests. Inspect Invalid department in the fixture. | Passed; incorrect complete Low requests enter Invalid; incomplete requests count as Failed. |
| AC-10 | Run availability, self-exclusion, and inactive/hidden-record exclusion tests. Inspect Original request under Unavailable. | Passed; only another eligible request with matching equipment/date establishes a conflict, subject to High and Low-duplicate exceptions. |
| AC-11 | Run normalized-name, equal-date, and oldest-original tests. Inspect Active duplicate using differently spaced/capitalized equipment. | Passed; equipment whitespace and case are ignored and the oldest matching record remains the original. |
| AC-12 | Run nonmatching equipment/date and invalid-date tests. | Passed; different equipment or dates, invalid dates, and self-matches do not establish matches. |
| AC-13 | Run duplicate-identification and before-deadline tests. Reload the fixture and inspect Active duplicate. | Passed; it remains Duplicate and identification time persists rather than restarting on reload. |
| AC-14 | Run exact 14-day expiry and retention tests. Inspect Aged duplicate under Discarded on fixture load. | Passed; eligible aged duplicates move without deletion or automatic completion. |
| AC-15 | Run invalid-recovery-priority tests. Click Recover without selecting a priority. | Passed; recovery is refused and the labeled priority selector receives focus. |
| AC-16 | Run recovery tests for Low, Medium, High. Recover Aged duplicate as Low and reload. | Passed; data is retained and it appears under Unavailable due to its remaining equipment/date conflict. High recovery is placed in High. |
| AC-17 | Run future-clock and reload tests for recovered records. Confirm the recovered Low request stays outside Duplicate after reload. | Passed; the permanent exemption survives and prevents future duplicate discard. |
| AC-18 | Run recovery/closure separation tests. Inspect an aged discarded and recovered record before closing it. | Passed; neither discard nor recovery sets the closure timestamp. |
| AC-19 | Run closure persistence tests. Activate Close request by keyboard on the recovered record and reload. | Passed; it appears in Closed with a completion timestamp and retains its other information. |
| AC-20 | Run the unchanged local server and inspect package.json. | Passed; browser verification used only the local server, existing localStorage, and plain JS/HTML/CSS. No login, database, production dependency, or external service was added. |

## Additional regression and interaction checks

- Normal form submission was exercised in the browser: request added, form cleared, Medium reset, and requester focus restored.
- An incomplete submission was exercised and restored after reload while absent from the manager list.
- Recovery without a selection showed an error and focused its labeled selector; valid Low recovery persisted after reload.
- Closure was activated with Enter and persisted after reload.
- HTML-like requester/equipment text appeared literally rather than becoming an image or executing markup.
- Existing request counts include all manager-visible records, including retained Discarded and Closed records, and exclude hidden attempts.

## Practical limits

- Records remain local to the same browser profile and origin. There is no role enforcement or cross-device sharing.
- Deadline processing occurs on opening, reload, focus, and return to the visible page. There is no processing while the app is closed.
- Browser fixtures use pre-aged timestamps for integration checks; exact time boundaries are tested by the automated controlled clock.
- The existing development server's Windows root-path issue is outside this change; use `/index.html` as described above.

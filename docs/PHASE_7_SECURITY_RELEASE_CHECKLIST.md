# Phase 7 — Security and Release Readiness Checklist

**Status:** Release-hardening checklist; items are not complete until evidence is recorded. This is a portfolio project, not a certified security review or a production-payroll approval.

## 1. Safe test conditions

- [ ] Use only synthetic employee accounts, salary values, email addresses, leave and attendance records.
- [ ] Run mutation, adversarial or load tests only against localhost or an explicitly authorized disposable staging environment.
- [ ] Use a disposable MongoDB integration-test database whose name contains `test`. Never use the app database or production data for integration tests.
- [ ] Confirm no test path connects to a real payment provider; payment simulation must remain clearly labelled.
- [ ] If the hosted portfolio demo enables `ENABLE_LOCAL_PAYOUT_TESTS=true`, verify it remains admin-only, uses only the local adapter, records clearly labelled test outcomes, and never contacts a payment provider or moves money. Keep it false for real payroll use.
- [ ] Check that secrets and actual employee data are not in commits, screenshots, test fixtures or CI logs.

## 2. Authentication and authorization

- [ ] Verify unauthenticated requests cannot access employee, payroll, transaction, leave, WFH or attendance records.
- [ ] Verify an employee cannot call admin-only list/approval/retry/finalization routes directly.
- [ ] Verify employee A cannot read employee B's data by changing IDs, query parameters or request bodies.
- [ ] Verify unsafe cookie-authenticated requests reject absent/untrusted `Origin` headers.
- [ ] Verify temporary employee passwords must be changed before workspace access; password reset invalidates existing sessions.
- [ ] Verify password hashes, cookies, reset codes and tokens never appear in responses or logs.
- [ ] Confirm the deployed frontend origin matches the exact trusted-origin/CORS configuration; do not loosen origin checks to work around cookies.

## 3. Payroll and transaction integrity

- [ ] Confirm salary amounts are validated as safe integer INR paise and computed server-side.
- [ ] Confirm employees whose employment start date is outside the selected period are excluded by server logic.
- [ ] Confirm only one run can be created for a payroll period and saved snapshots do not change after profile edits.
- [ ] Confirm a run cannot be finalized while simulations are failed or incomplete.
- [ ] Confirm retry reuses the same logical transaction and duplicate simulations cannot create duplicate records.
- [ ] Confirm employees see only their own finalized payroll and transaction history.
- [ ] Confirm approved unpaid leave is distinct from fixed deductions, pending leave blocks run creation, and payroll-period locks reject later changes.
- [ ] Confirm WFH attendance is only permitted for an approved current-day request, timestamps come from the server, and attendance itself never causes a payroll deduction.

## 4. Input validation and API resilience

- [ ] Confirm request schemas reject unknown fields and client attempts to set roles, employee IDs, actors, approval status, calculated pay or transaction status.
- [ ] Confirm malformed IDs, periods and pagination are rejected without business-data side effects.
- [ ] Confirm request-body size and rate limits are suitable for the selected demo topology.
- [ ] Confirm production errors return generic messages and logs do not expose environment variables or sensitive salary/PII fields.
- [x] User-reported local `npm audit` checks on 2026-10-28: root, server and client reported zero vulnerabilities after `npm audit fix --prefix server` upgraded the resolved backend `body-parser` dependency to 2.4.0. The root/server/client lockfiles were pushed in commit `63e5746`; root and server use `npm ci`. Client CI uses `npm install --include=optional` because the Windows-generated lockfile omitted platform-specific optional WASM dependency entries required by Linux CI. The high-severity audit gate passed in user-confirmed run #312.
- [ ] Confirm any database mutation failure leaves business records unchanged, especially where multi-document operations are not transactional.

## 5. Runtime, environment and deployment

- [ ] Set a strong unique `JWT_SECRET` outside source control.
- [ ] Store production values in the hosting provider's environment/secret settings; never commit `server/.env`.
- [ ] Configure HTTPS, secure cookies, exact CORS/trusted origin and the correct trusted-proxy setting for the deployment topology.
- [ ] Use a least-privilege database user and restrict database network access.
- [ ] Verify `/api/health`, startup logs, restart behavior, shutdown and error handling.
- [ ] Document database backups and perform a restore test before using important data.
- [x] Run the bounded benchmark against localhost and record request count, concurrency, success/failure count and endpoint p50/p95/p99 latency. The 2026-10-28 run was against `http://127.0.0.1:5001`; host/runtime and dataset-size context were not supplied, and use of synthetic-only records still needs explicit confirmation.
- [ ] Do not infer supported user count from health-endpoint requests per second or a small synthetic benchmark.

## 6. Final release gate

- [x] User-reported local `npm test` passed 63 unit/API tests on 2026-10-28.
- [x] User-reported local `npm run test:integration --prefix server` passed all 4 MongoDB integration tests on 2026-10-28.
- [x] User-reported local `npm run build` passed on 2026-10-28; Vite emits a non-fatal large main-chunk warning (857.57 kB minified / 240.94 kB gzip).
- [x] The authenticated API performance smoke test ran locally and its bounded scope/limitations are documented; it is not a production-capacity guarantee.
- [x] User reported the Phase 6 browser regression is passed; after the latest AI UI change the user also confirmed that the offline demo insights panel works correctly.
- [x] Screenshot confirms CI run #309 passed after the client install step was changed to `npm install --include=optional`; documentation-only runs #310 and #311 also passed. Root and server retain `npm ci`.
- [x] User screenshot confirms GitHub Actions run #312 passed the root/server/client `npm audit --audit-level=high` step; documentation-only runs #313–#315 also passed.
- [x] Frontend lint (`npm run lint`) completes locally with zero errors and one non-blocking Fast Refresh warning; GitHub Actions CI run #331 passed the lint/build verification pipeline.
- [ ] README setup and recovery steps work from a clean checkout.
- [ ] Known limits are documented: simulated payments only; simplified salary formula; no claim of statutory/tax compliance; no physical-location proof from WFH attendance.
- [ ] No production-readiness claim is made until security, privacy, compliance, operational and recovery reviews appropriate to the intended use have actually been completed.

## Evidence log

| Date | Check | Result / artifact | Open findings |
| 2026-10-29 | Local payout-provider lifecycle | GitHub Actions run #337 passed on commit `d5cac19`: dependency audits, lint, unit/API tests, MongoDB-backed payroll integration tests, and frontend build. The user subsequently confirmed the local Processing → status event → retry lifecycle works in the browser. | This adapter is local-only; no RazorpayX APIs or real webhook signatures are integrated and no money is transferred. |
| 2026-10-29 | Phase 8 offline demo and final local checks | User confirmed the offline AI insights demo works; local checks: 77/77 unit/API tests, lint with 0 errors and 1 non-blocking warning, production build succeeded with a large-chunk warning, root/server/client audits reported zero vulnerabilities. CI run #331 passed on commit `3b1853e`: https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40854587362 | Real Gemini generation currently depends on free-tier quota and previously returned HTTP 429; billing remains disabled. Other deployment/security checklist items remain open and must not be treated as production clearance. |
|---|---|---|---|
| 2026-10-28 | CI run #298 | Benchmark syntax check, 63 unit/API tests, 4 MongoDB integration tests and frontend production build passed on commit `e9ea77e` | This was before the lockfile CI change; see run #309 for the cross-platform install fix. Lint/static-analysis and deployment/security checks remain open. |
| 2026-10-27 | Phase 6 browser regression | User reported payslips/exports/privacy, leave workflow, WFH attendance and final regression passed | Reported by user; not independently observed in this document |
| 2026-10-28 | Authenticated API performance smoke test (user-reported) | `http://127.0.0.1:5001`; 40 requests, 40 passed, 0 failed; concurrency 4; 313.5 req/s reported over 127.6 ms. Endpoint p50/p95/p99 (ms): employee list 9.5/17.1/17.1; payroll list 9.5/20.7/20.7; transaction list 9.6/28.0/28.0; payroll preview 12.1/38.8/38.8. | Local-only bounded smoke test; host/runtime and dataset-size details not supplied; confirm synthetic-only test data. Not a production-capacity guarantee. |
| 2026-10-28 | Local dependency audit and regression verification (user-reported) | Root/server/client audits all report zero vulnerabilities after resolving `body-parser` to 2.4.0; 63/63 unit/API tests, 4/4 MongoDB integration tests and Vite build passed. | Generated package-lock files must be committed and CI rerun using reproducible installs. Main Vite chunk warning remains non-fatal; verify benchmark used synthetic-only data. |
| 2026-10-28 | Cross-platform CI dependency install fix | Screenshot confirms CI run #309 passed on commit `390b856`; documentation-only runs #310 and #311 also passed. Root/server use `npm ci`; client uses `npm install --include=optional` because the Windows-generated lockfile omitted optional WASM dependencies required by Linux CI. | A separate high-severity npm audit gate was added in commit `572799f`; verify its CI result. Main Vite chunk warning remains non-fatal; confirm benchmark used synthetic-only data. |
| 2026-10-29 | Dependency-audit CI gate | User screenshot confirms run #312 passed `npm audit --audit-level=high` for root/server/client; documentation-only runs #313–#315 also passed. | Reconcile lint status: current GitHub main still has no lint script/CI lint step. Main Vite chunk warning remains non-fatal; remaining security/deployment checklist items stay open. |
| 2026-10-29 | ESLint setup added (verification pending) | ESLint flat config, root/client lint scripts, README quality-check instructions, and GitHub Actions lint step added in commits `414bc5f`, `2802882`, `0cf18a5`, `b4e08d5`, and `a1a104d`. | Pull latest main on Windows, run `npm install --include=optional --prefix client`, then `npm run lint`; review any errors and verify a new CI run. |

# Phase 7 — Security and Release Readiness Checklist

**Status:** Release-hardening checklist; items are not complete until evidence is recorded. This is a portfolio project, not a certified security review or a production-payroll approval.

## 1. Safe test conditions

- [ ] Use only synthetic employee accounts, salary values, email addresses, leave and attendance records.
- [ ] Run mutation, adversarial or load tests only against localhost or an explicitly authorized disposable staging environment.
- [ ] Use a disposable MongoDB integration-test database whose name contains `test`. Never use the app database or production data for integration tests.
- [ ] Confirm no test path connects to a real payment provider; payment simulation must remain clearly labelled.
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
- [x] User-reported local `npm audit` checks on 2026-10-28: root, server and client report zero vulnerabilities after `npm audit fix --prefix server` upgraded the resolved backend `body-parser` dependency to 2.4.0. The user generated root/server/client lockfiles locally; verify they are present, commit them, and rerun the audit/CI against the committed lockfiles before treating dependency verification as reproducible.
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
- [ ] The Phase 6 browser regression remains passed after any code changes.
- [ ] README setup and recovery steps work from a clean checkout.
- [ ] Known limits are documented: simulated payments only; simplified salary formula; no claim of statutory/tax compliance; no physical-location proof from WFH attendance.
- [ ] No production-readiness claim is made until security, privacy, compliance, operational and recovery reviews appropriate to the intended use have actually been completed.

## Evidence log

| Date | Check | Result / artifact | Open findings |
|---|---|---|---|
| 2026-10-28 | CI run #298 | Benchmark syntax check, 63 unit/API tests, 4 MongoDB integration tests and frontend production build passed on commit `e9ea77e` | Commit generated lockfiles; switch CI to `npm ci` and verify the dependency-updated commit. Lint/static-analysis and deployment/security checks remain open. |
| 2026-10-27 | Phase 6 browser regression | User reported payslips/exports/privacy, leave workflow, WFH attendance and final regression passed | Reported by user; not independently observed in this document |
| 2026-10-28 | Authenticated API performance smoke test (user-reported) | `http://127.0.0.1:5001`; 40 requests, 40 passed, 0 failed; concurrency 4; 313.5 req/s reported over 127.6 ms. Endpoint p50/p95/p99 (ms): employee list 9.5/17.1/17.1; payroll list 9.5/20.7/20.7; transaction list 9.6/28.0/28.0; payroll preview 12.1/38.8/38.8. | Local-only bounded smoke test; host/runtime and dataset-size details not supplied; confirm synthetic-only test data. Not a production-capacity guarantee. |
| 2026-10-28 | Local dependency audit and regression verification (user-reported) | Root/server/client audits all report zero vulnerabilities after resolving `body-parser` to 2.4.0; 63/63 unit/API tests, 4/4 MongoDB integration tests and Vite build passed. | Generated package-lock files must be committed and CI rerun using reproducible installs. Main Vite chunk warning remains non-fatal; verify benchmark used synthetic-only data. |

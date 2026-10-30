# CloudConduction Payroll — Project Plan & Continuity Handoff

> Handoff updated 2026-10-29: Phase 6 browser regression was reported passed, Phase 8 AI Payroll Insights is implemented, and a local payout-provider lifecycle is now available for development/test. GitHub Actions run [#337](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40863534173) passed after adding processing/succeeded/failed states, idempotent local status events, retry-to-processing behavior, and admin UI controls. The local payout adapter does not connect to RazorpayX or transfer money. Gemini free-tier requests may still be blocked by HTTP 429; billing remains disabled. The project remains a portfolio application with simplified payroll rules and open release-checklist items before any production use.

> This file is the project continuity source of truth. Read it before implementation work. Update status, decisions, completed work, tests and next task after meaningful changes.

## Project identity
- Project: CloudConduction Payroll
- Owner: https://github.com/shivkumar15
- Repository: https://github.com/shivkumar15/cloudconduction-payroll
- Goal: resume-ready MERN payroll-management demo showcasing secure APIs, role-based access, payroll calculations, simulated transactions, dashboards and testing.
- Scope boundary: portfolio/demo application only. Payments are simulated; no real transfers. Do not represent it as production-ready for actual payroll, banking, tax or compliance.

## Confirmed decisions
- Complete project from scratch, end to end.
- React + Vite, Tailwind CSS v4, React Router, Axios, Recharts.
- Node.js + Express REST API, MongoDB + Mongoose.
- Simulated payments only.
- Employment start date is required and validated on employee creation; payroll preview and draft creation enforce period eligibility on the server. Legacy records without this field use `createdAt` as a compatibility fallback; a date is locked after the employee is captured in a saved payroll snapshot.
- Attendance direction (decided 2026-10-27): support a work-from-home (WFH) request and approval workflow, with employee check-in/check-out only on approved WFH dates. Do not implement office Wi-Fi, office public-IP, or network-matching attendance verification. WFH attendance is an auditable application record, not cryptographic proof of the employee's physical location.
- Payroll enhancement policy (updated 2026-10-27): fixed monthly deductions remain part of the employee salary structure; approved unpaid-leave deductions are separate variable deductions. An employee may request a start/end range contained within one payroll month; the server creates one auditable day record for each Monday–Friday date, skips weekends, and links those records so one admin decision approves/rejects the complete range. Public holidays and custom employee schedules are not modeled, so admins must review the selected dates. Per-day rate = (monthly base salary + monthly allowances) divided by the number of Monday–Friday dates in that calendar month. Unpaid-leave deduction is the nearest integer paise to daily rate × approved leave days, calculated with integer-safe arithmetic. Existing fixed deductions are added separately. If combined deductions exceed gross earnings, payroll preview/run creation is blocked for admin resolution instead of producing negative net pay. Pending leave requests must be resolved before a payroll run can be created. Once any payroll run exists for a month, no requests or decisions for that month may be newly created or approved, preserving snapshots; date ranges therefore cannot cross payroll months. This is an illustrative demo policy, not a statement of Indian statutory payroll compliance.
- AI Payroll Insights (implemented 2026-10-29): the admin-only advisory panel is implemented in Phase 8. The server computes and sends aggregate-only finalized payroll metrics to Gemini, validates structured model output, applies access/rate limits, and fails safely on quota errors. The UI also has a clearly labelled offline demo mode that uses saved aggregate totals locally without an API call. Keep billing disabled; the live provider remains subject to Google's free-tier quotas. The feature cannot change payroll or employee records.
- Local payout provider lifecycle (implemented 2026-10-29): the development/test adapter creates `local-test` payout requests in `processing`, then accepts admin-only, deduplicated local status events to move them to `succeeded` or `failed`. Provider-like IDs/references and event history are stored; failed retries return to processing. The local event endpoint and local payout actions are disabled in production. This is not a RazorpayX connection or a real webhook; integration is pending official sandbox access.
- Mandatory pre-implementation security plan (2026-10-27): review and maintain [docs/SECURITY_AND_ADVERSARIAL_TEST_PLAN.md](SECURITY_AND_ADVERSARIAL_TEST_PLAN.md) before implementing payroll adjustments, WFH attendance, or AI insights. It includes employee abuse scenarios, authorization/data-integrity tests, AI-abuse cases, environment rules, and release gates. These are planned tests, not results already achieved.
- Use Zod validation, secure authentication, role-based access control, tests, clear setup steps and good documentation.
- Maintain this plan as a continuity file; do not restart completed work.

## Product scope
### Admin
- Overview metrics, payroll totals, deductions, transaction status and period filters.
- Employee CRUD and salary-structure management.
- Payroll preview, approval, processing and history.
- Planned: review/approve WFH requests, review attendance records, and review monthly payroll adjustments.
- Period locking and duplicate-run prevention.
- Charts and audit trail for sensitive admin actions.
### Employee
- Secure self-service dashboard, own profile and salary history.
- Earnings, bonuses, deductions, net pay, payroll periods and payslips.
- Submit WFH requests and check in/check out only for approved WFH dates; use sidebar sections to navigate between overview, attendance, leave, payslips and transactions.
- Server-side ownership checks: employees must not access another employee's records by changing IDs.
### Payroll and transactions
- Currency as integer minor units (INR paise), not floating-point rupees.
- Document demo salary formula; do not claim legal/tax compliance.
- Explicit lifecycle (e.g., draft → approved → processing → paid/failed) with server-side transition rules.
- Clearly label payment simulations. Use idempotency keys and DB constraints against duplicates.
- Every amount has a currency. Optional multi-currency support must record exchange rate, timestamp/source and converted amount.

## Non-goals
- No actual disbursements.
- No real Aadhaar/identity documents or sensitive production data.
- No tax/legal advice.
- Use synthetic data only; no claim of production readiness.

## Architecture
`React UI → Axios → Express routes → authentication/authorization → Zod validation → service/business rules → Mongoose/MongoDB → API response → UI/charts`

Keep business rules in testable service modules rather than controllers. Authorization and data validation must be enforced on the server.

## Planned layout
```text
cloudconduction-payroll/
├── client/src/{components,layouts,pages/{auth,admin,employee},features/{employees,payroll,transactions,analytics},services,hooks}/
├── server/src/{config,models,routes,controllers,services,middleware,validators,utils}/
├── docs/PROJECT_PLAN.md
├── .github/workflows/
├── README.md
├── .gitignore
└── package.json
```

## Technology decisions
- Choose an actively supported Node version and document the tested version.
- Tailwind v4 via `@tailwindcss/vite`.
- Axios API client with credential settings if using cookie auth.
- Express, Mongoose, Zod, bcrypt/bcryptjs, Helmet and rate limiting.
- JWT/session cookies must address CSRF, SameSite, Secure-in-production, credentialed CORS, expiry and logout invalidation. Never trust client roles.
- Automated unit/integration tests; make sure test packages/commands are installed and actually run.
- INR stored as integer paise with range/overflow validation.
- Payroll period normalized (e.g. `YYYY-MM`) and business timezone documented.
- Avoid unreviewed major dependency upgrades mid-build.

## Security checklist
### Authentication/session
- [ ] Password hashing, never plaintext.
- [ ] Login errors do not unnecessarily reveal account existence.
- [x] HTTP-only cookie; Secure in production; SameSite=Lax.
- [x] Exact trusted-Origin check for unsafe cookie-authenticated requests.
- [x] Login rate limit and generic credential error.
- [x] Eight-hour token expiry and version-based session invalidation on logout/password reset.
- [x] Email password reset with six-digit OTP, HMAC digest, 10-minute expiry, attempt limit, resend cooldown and atomic single-use consume.
- [ ] Validate CSRF/origin strategy for actual deployment topology; never loosen it just to make cross-origin cookies work.
- [ ] Configure and verify an actual SMTP provider with an owned test mailbox.
- [ ] Admin provisioned through secure seed/admin workflow; no public role self-selection.
### Authorization/privacy
- [x] Central requireAuth and requireRole middleware.
- [x] Employee data ownership enforced server-side for employee self-service and direct record reads.
- [x] Explicit employee writable fields; request schemas reject extra fields and prevent role injection.
- [ ] Never trust client-supplied role, salary, net pay, amount, status or employee ID without server checks.
- [ ] Never log password, tokens, cookies or sensitive salary details.
- [ ] Synthetic data only.
### API/infrastructure
- [x] Validate employee route IDs, list query params and create/update bodies; existing auth routes also validate inputs.
- [x] Exact CORS origin allowlist; Helmet; body-size caps; rate limiting.
- [ ] Generic production 500 responses and minimal structured logs.
- [ ] HTTPS in deployment; secrets in host environment, not repo.
- [ ] Least-privilege DB credentials/network rules.
- [ ] Unique indexes and atomic updates/transactions where needed.
- [ ] Audit logs for admin changes and payroll state transitions.
- [ ] Dependency audit, error-path tests, backup/restore documentation before serious use.

## Data model plan
1. **User:** normalized unique email, passwordHash, role (`admin`/`employee`), employee ref, active flag, timestamps; never serialize passwordHash.
2. **Employee:** unique employeeCode, name, work email, department, designation, currency, salary structure, status, timestamps. Map identity/login consistently; do not expose sensitive fields in general lists.
3. **Payroll:** employee ref, period, currency, pay components in minor units, gross, deductions, net, status, created/approved/processed timestamps and actors. Enforce unique employee+period or run+employee depending on revision design.
4. **Transaction:** payroll ref, simulated provider, idempotency key, amount in minor units, currency, status, simulated reference, timestamps; unique idempotency key.
5. **Payslip:** payroll reference plus generated document metadata, or generate from finalized snapshot; owner/admin-only access.
6. **AuditLog:** actor, action, resource type/id, timestamp and minimal metadata; avoid unnecessary salary/PII content.

## API plan (refine alongside implementation)
### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- Secure development admin seed/provisioning; no insecure public admin-creation route.
### Employees
- `GET /api/employees` (admin)
- `POST /api/employees` (admin)
- `GET /api/employees/:id` (admin/owner)
- `PATCH /api/employees/:id` (admin, explicit editable fields)
- `DELETE /api/employees/:id` or deactivate
- `GET /api/employees/me`
### Payroll
- `GET /api/payroll?period=YYYY-MM`
- `POST /api/payroll/preview`
- `POST /api/payroll/runs` (or similarly named create/approve/process endpoints)
- `GET /api/payroll/:id`
- `GET /api/payroll/me`
### Transactions/reports
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `GET /api/analytics/summary?period=YYYY-MM`
- `GET /api/payslips/:payrollId`
Apply role/ownership rules to all endpoints. Enforce all state transitions and monetary logic server-side.

## Implementation phases and acceptance criteria
### Phase 0 — repo and plan
- [x] Agree project name, stack, simulated payment scope, end-to-end approach.
- [x] Create `shivkumar15/cloudconduction-payroll` GitHub repository (verified by connector on 2026-10-22).
- [x] Commit starter scaffold, this plan and README to `main`.
- Acceptance: repository contains the initial scaffold and documented setup; no real secrets are committed.
### Phase 1 — foundation
- [x] Initial starter scaffold generated locally (React/Vite/Tailwind, Express/Mongoose connection, health endpoint, baseline security middleware, one health test).
- [x] User reports local app/URLs opened successfully without errors.
- [x] Confirm client production build and `npm test` results specifically (user verified locally on 2026-10-23: 32 tests passed and the Vite production build succeeded).
- [ ] Add lint/format commands if useful.
- Acceptance: start command, client build, health endpoint and tests all pass. Local startup is user-reported; production build/test evidence is not yet captured.
### Phase 2 — authentication and authorization
- [x] User model with unique normalized email, password hash, role, active flag, employee link, `mustChangePassword` and session token version.
- [x] Admin seed/provisioning script; no public registration endpoint.
- [x] Login/logout/current-user and authenticated change-password routes.
- [x] Newly created and legacy employee accounts without the flag are marked through a role-aware default for mandatory temporary-password change; backend role-protected APIs refuse workspace access until changed.
- [x] Password changes verify the current password, enforce a 12-character minimum, reject reuse, update the bcrypt hash, clear the mandatory flag, invalidate other sessions, and issue a fresh cookie for the active browser.
- [x] Change-password screen is accessible to all authenticated roles; dashboard links exist for both admin and employee.
- [x] HttpOnly session cookie, eight-hour expiry, SameSite and Secure-in-production settings.
- [x] Session token verification and role middleware.
- [x] Trusted-Origin enforcement on unsafe API methods.
- [x] Email password-reset OTP: SMTP adapter, HMAC code hash, ten-minute expiry, cooldown, attempt limit, single-use reset and invalidation of existing sessions.
- [x] Accessible show/hide password toggles on login, password-reset, reset-confirmation, and admin-created employee initial-password inputs.
- [x] Tests cover anonymous access, malformed login/reset input, OTP shape/HMAC, missing/untrusted origin and absent SMTP configuration.
- [x] Verify actual SMTP delivery and password-reset flow with a user-controlled test mailbox (user confirmed code delivery and successful password reset on 2026-10-23).
- [x] Add tests for change-password validation and anonymous-route denial; MongoDB integration verifies mandatory first-login change, blocked workspace access, incorrect/reused password rejection, session invalidation and successful new-password login.
- [x] Verify SMTP delivery with a test mailbox after configuring provider settings (completed 2026-10-23).
- [x] GitHub Actions CI passed for the password-reset UI, OTP utility/API validation tests, Nodemailer dependency and connection-pool/load-test commits; the latest documented-plan run also passed tests and build.
- Acceptance: automated tests/build pass in CI, and the user confirmed actual SMTP delivery plus successful password reset. The broader local login/change-password/admin/employee browser smoke test and database-backed load metrics remain to be verified.
### Phase 3 — employee management
- [x] Employee model with unique employee code/work email, explicit INR currency, status, timestamps and salary structure stored in integer paise.
- [x] Employment start date capture, date-only validation, legacy fallback and server-side lock after payroll snapshots.
- [x] Zod create/update/query validation, including no unknown fields and deductions not exceeding gross earnings.
- [x] Admin list/create/update/deactivate APIs, including linked employee-login provisioning.
- [x] Pagination (maximum 100 per page), escaped search, department/status filters and deterministic sorting.
- [x] Employee self-service profile route and admin-or-owner single-record read guard.
- [x] Admin UI for employee creation, salary details, search, filters, pagination, edit, reactivate and deactivate.
- [x] Accessible eye/eye-off toggle for the initial employee password; audited all frontend password-entry forms, and login/reset/confirm-password fields already had toggles.
- [x] Employee workspace now fetches and displays its own profile and salary inputs.
- [x] Unit tests for request validation, unique-index definitions, admin-only role guard, ownership decisions, malformed IDs, and unauthenticated API denial.
- [x] Dedicated MongoDB-backed API lifecycle test covers create, duplicate code/email rejection, paginated search, linked login, role denial, owner vs. other employee reads, update, deactivation/session invalidation, and reactivation.
- [x] Latest GitHub Actions run at commit `81a16a79` passed, including the unit/API tests, MongoDB-backed employee integration test, and frontend production build.
- [ ] Complete a local browser smoke test of admin and employee workflows.
- Acceptance: implementation and database-backed test are committed; do not mark Phase 3 fully verified until the newest CI result and local browser smoke test pass.
### Phase 4 — payroll logic
- [x] Document demo salary formula and inputs: gross = base salary + monthly allowances; net = gross - monthly deductions; no tax/EPF/overtime/bonus/proration is claimed.
- [x] Pure unit-testable currency service using integer paise with unsafe/negative amounts and over-deductions rejected.
- [x] PayrollRun model with a YYYY-MM period, immutable embedded salary snapshots, totals and audit actor/time fields.
- [x] Preview/create/list/detail APIs plus draft → approved → finalized transitions; employee pay history returns only the employee's own finalized line item.
- [x] Unique period constraint and conditional status updates prevent duplicate monthly runs and repeated/invalid transitions.
- [x] Unit tests cover salary arithmetic, bad values, periods, status transitions, pagination and unique period index; MongoDB integration test covers preview, snapshot, duplicate period, admin authorization and employee ownership.
- [x] Confirm the new payroll unit tests, employee + payroll MongoDB integration tests, and frontend build passed GitHub Actions run #124 at commit `cbe3f189`.
- [x] User verified Phase 4 locally on 2026-10-23: `npm test` passed all 40 tests; `npm run build` passed (Vite transformed 1,656 modules); and `npm run test:integration --prefix server` passed both MongoDB integration tests.
- Acceptance: reproducible calculations and no unintended repeated payroll processing.
### Phase 5 — simulated transactions
- [x] Simulation adapter isolated from payroll calculation service; it uses a simulation-only provider/reference and never connects to an external payment provider.
- [x] Per-employee transaction records snapshot amount/currency and record succeeded/failed status, reference, failure reason, attempt count and attempt history.
- [x] Idempotency keys are deterministic per payroll run + employee; unique indexes also prohibit duplicate run/employee transaction records.
- [x] Admin API can simulate approved payroll, select employee codes for deterministic demo failures, list/filter transactions and inspect a transaction.
- [x] Failed transaction retry updates the existing logical transaction and records another attempt; a repeated retry is rejected.
- [x] Payroll finalization is blocked until every employee has exactly one successful simulated transaction; employee transaction history is restricted to their own finalized payroll.
- [x] Unit/API and MongoDB integration tests added for simulation outcome, input validation, idempotency, duplicate/retry behavior, role checks and finalization gate.
- [x] GitHub Actions run #127 at commit `17254331` passed 46 unit/API tests, both MongoDB integration tests, and the frontend production build.
- [x] User verified the latest `main` locally on 2026-10-23 after the Phase 6 JSX fixes: `npm test` passed all 46 unit/API tests, `npm run build` succeeded, and `npm run test:integration --prefix server` passed both MongoDB integration tests.
- Acceptance: repeating a simulation does not create duplicate transaction records, failures are testable/auditable, and no real transfers occur.
### Phase 6 — frontend
- [x] Login and protected routing (reuses the existing authenticated route guards and roles).
- [x] Responsive navigation links from the admin dashboard to employee management and payroll/transactions; employee page includes pay history.
- [x] API-driven admin dashboard metrics from saved employee, payroll-run and transaction records.
- [x] Admin payroll workspace: month preview, draft run creation, run selection/detail, approval, simulated payment execution, server-gated finalization and latest-period chart.
- [x] Simulated transaction table with period/status filters, pagination, simulation reference, per-attempt history, failed-attempt retry, and CSV export for the visible page.
- [x] Employee dashboard loads only the signed-in employee's profile, finalized payroll history and finalized transaction history from the existing /me APIs.
- [x] Payslip statement for a selected finalized period with print / browser Save as PDF and CSV export of the employee's own payroll/transaction history.
- [x] Loading, empty and API error states; accessible table headings, form labels and action/status text; responsive layouts and print-specific payslip styles.
- [x] Chart uses saved payroll-run snapshots and includes period labels; the saved-run table presents the underlying payroll periods and amounts.
- [x] GitHub Actions CI passed the employment-start-date fix at commit `0b2c2d0`; API/unit tests, MongoDB-backed integration tests and frontend production build succeeded.
- [x] User verified locally after the employment-start-date fix on 2026-10-26: `npm test` passed 47 tests, `npm run build` succeeded (Vite 6.4.5; 2,275 modules transformed), and `npm run test:integration --prefix server` passed both MongoDB integration tests. Vite's >500 kB minified-chunk warning is non-fatal.
- [x] User completed the Phase 6 browser regression on 2026-10-27 using the app's synthetic/demo records: payslip viewing/downloading/printing; employee payroll and transaction history, CSV export and privacy; employee sidebar and date-range leave submission; admin grouped leave approval/rejection and payroll-period lock; WFH request/approval/attendance; and final browser regression (user-reported passed).
- [x] Latest GitHub Actions run [#289](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40512451738) passed 63 unit/API tests, all 4 MongoDB-backed integration tests, and the frontend production build at commit `8cbd8da`.
- Acceptance: met for Phase 6. Simulation-only wording, server-side authorization/state gates and automated CI checks are in place; manual browser smoke results are user-reported, not independently observed by the assistant.
### Phase 7 — quality and release (started 2026-10-28)
- [x] Unit/API test suite and MongoDB integration suite are run by GitHub Actions; run #289 passed 63 unit/API tests and 4 database-backed integration tests.
- [x] Bounded concurrency health-endpoint smoke-test script (default 25 concurrent workers / 250 requests).
- [x] Historical local health-endpoint smoke result recorded: `http://127.0.0.1:5001/api/health`; 250 requests; concurrency 25; 250 successful, 0 failed/non-2xx; elapsed 212 ms; throughput 1,177.3 req/s; p50 11.7 ms, p95 46.7 ms, p99 60.1 ms. This tests only the health endpoint, not payroll capacity.
- [x] Added guarded authenticated API performance harness at `server/src/scripts/authenticatedApiTest.js`, exposed as `npm run test:api-perf`. It measures employee/payroll/transaction list endpoints and non-persisting payroll preview using bounded iterations/concurrency and remote-target safeguards.
- [ ] Run the authenticated benchmark locally using a dedicated synthetic admin/test account; record measured endpoint latency and failure counts. The benchmark has not been run by the assistant because the local server and admin credentials are not available here.
- [x] Added `docs/PHASE_7_SECURITY_RELEASE_CHECKLIST.md` covering secrets/env, access control, payroll invariants, leave/WFH, CI, dependency checks and deployment release gates.
- [x] CI workflow covers benchmark-script syntax, API tests, MongoDB integration tests and frontend build. GitHub Actions run [#298](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40694158840) passed on commit `e9ea77e`: 63 API/unit tests, 4 MongoDB integration tests and frontend build.
- [x] README documents Phase 7 verification commands and safe usage of the authenticated benchmark.
- [x] Added ESLint flat config at `client/eslint.config.js`, client and root `lint` scripts, and a CI lint step. Official ESLint flat config and React plugin guidance informed the setup. Local frontend lockfile regeneration and successful lint/CI execution remain pending.
- [ ] Add or document an explicitly synthetic seed workflow if still needed; never seed a production database.
- [ ] Review deployment configuration, environment settings, HTTPS, health checks, logs and backup/restore steps.
- Acceptance: clean-clone process is repeatable, no secrets/real PII, benchmark scope/results are documented honestly, security release gates are reviewed, and known demo limitations remain explicit.

### Phase 8 — AI Payroll Insights (implemented 2026-10-29)
- [x] Admin-only, read-only insight panel based on server-computed aggregate finalized-period metrics; individual identifiers and salary line items are excluded from model input.
- [x] Existing payroll calculations and state transitions remain authoritative. The model has no tools and cannot mutate records, approve payroll or set transaction status.
- [x] Server-side Gemini provider integration, server-only API key, structured and Zod-validated output, timeouts, rate limits and safe provider-error states are implemented.
- [x] Provider calls are mocked in automated tests; CI does not need a real Gemini key or use paid API access.
- [x] Tests cover role protection, period validation, aggregate-only input, output validation, quota errors and timeouts.
- [x] The offline demo mode creates a clearly labelled local summary from saved aggregate totals without contacting Gemini; the user confirmed it works in the browser.
- The live Gemini integration remains subject to Google's free-tier eligibility and quota. It previously returned HTTP 429 while billing was disabled. This feature is advisory only and does not calculate authoritative wages or claim tax/legal compliance.

### Local payout provider lifecycle (implemented 2026-10-29)
- [x] Local provider adapter creates payout-like references and IDs without making network calls or moving money.
- [x] New payout requests remain processing until an administrator applies a local success/failure status event.
- [x] Test events are authenticated, admin-only, validated, recorded in event history, and de-duplicated by event ID; terminal states cannot be changed by replayed/out-of-order events.
- [x] Retrying a failed local payout creates a new processing attempt. Payroll finalization still requires every payout to be succeeded.
- [x] Local payout creation, retries and status events are disabled in production by default and require explicit `ENABLE_LOCAL_PAYOUT_TESTS=true` opt-in for the admin-only portfolio demonstration. The adapter makes no external payment calls and transfers no money.
- [ ] RazorpayX has not been connected. Wait for official sandbox/API access, then build the provider adapter and verify actual webhook signatures before making any live-provider claims.
- Verification: GitHub Actions run [#337](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40863534173) passed lint, API tests, MongoDB-backed payroll integration tests, dependency audits and frontend build. The user confirmed the local payout workflow works in the browser, including Processing, success/failure events and retry behavior; the latest responsive overflow fix is also reported working.


## Local commands (current scaffold)
```bash
npm install
npm install --prefix server
npm install --prefix client
# copy server/.env.example to server/.env and edit it
npm run dev
npm test
npm run build
```
Expected: frontend `http://localhost:5173`; health endpoint `http://localhost:5001/api/health`. MongoDB must run for backend startup, while the health test imports the app without starting DB connection.

## Current status — 2026-10-23
- GitHub repository: `https://github.com/shivkumar15/cloudconduction-payroll` (public, default branch `main`; connected account has push/admin access).
- User locally verified Phase 3 on 2026-10-22: `npm test` passed all 32 tests (0 failures and no Mongoose timeout after the deterministic SMTP test fix); `npm run build` passed (Vite transformed 1,656 modules); and `npm run test:integration --prefix server` passed its MongoDB-backed employee lifecycle test (1 passed, 0 failed). The user also confirmed receiving the password-reset OTP email and successfully completing the reset.
- Foundation files are committed. Phase 3 adds `server/src/models/Employee.js`, `server/src/utils/money.js`, `server/src/validators/employeeSchemas.js`, `server/src/controllers/employeeController.js`, `server/src/routes/employeeRoutes.js`, and ownership middleware. Routes are mounted at `/api/employees`.
- Authentication API files are committed: `server/src/models/User.js`, `server/src/utils/sessionToken.js`, `server/src/validators/authSchemas.js`, `server/src/middleware/auth.js`, `server/src/middleware/trustedOrigin.js`, `server/src/controllers/authController.js`, `server/src/routes/authRoutes.js`, and `server/src/scripts/seedAdmin.js`.
- Auth routes are mounted in `server/src/app.js`; tests cover anonymous `/me`, malformed login input, missing Origin and untrusted Origin. Ephemeral test servers now await listening/close correctly.
- `server/package.json` contains `seed:admin`. `.env.example` documents optional seed variables; no actual secret values were committed.
- Frontend login UI, Axios API client, session context, protected routes and logout controls are committed. Admin `/admin/employees` supports create/edit/deactivate/reactivate, pagination/search/filters and an initial-password visibility toggle; employee `/employee` loads the linked user's own profile. All current UI password fields now have show/hide controls.
- `.github/workflows/ci.yml` runs backend tests and frontend production build on pushes and PRs.
- No public signup is available. Phase 3 employee API/UI and Phase 4 payroll backend are implemented; Phase 4 was verified locally by the user and by CI. Phase 5 simulated transaction backend is implemented and locally re-verified on 2026-10-23 alongside the Phase 6 fixes (46 unit/API tests, successful build and 2 MongoDB integration tests). Phase 6 admin payroll/transaction screens, API-driven dashboard metrics, employee finalized-pay history, payslip print/export and navigation are committed; Phase 6 CI status and browser smoke testing remain pending.
- Password visibility toggle was added to sign-in form; a forgot-password UI now supports requesting an email OTP and setting a new password.
- OTP codes are generated with cryptographic randomness, stored as user-bound HMAC digests, expire after 10 minutes, accept at most 5 wrong code attempts, apply a 60-second resend cooldown, and are consumed via a conditional atomic update. Successful reset increments session version.
- SMTP service uses env-based Nodemailer configuration. User confirmed SMTP delivery to a controlled test mailbox and successfully completed password reset on 2026-10-23. Do not store live SMTP credentials in the repository; full provider-specific failure/recovery testing may still be expanded.
- MongoDB pool configured with max 20/min 2 sockets per server process. Added bounded health-endpoint smoke test, defaults 25 concurrent workers and 250 requests; no load run/actual capacity is claimed yet. Employee APIs are paginated; production multi-instance rate limiting needs a shared store.
- Added tests for OTP helper/reset validation and Phase 3 employee schemas, unique-index definitions, role guard, ownership policy, malformed IDs and unauthenticated routes. The dedicated MongoDB-backed employee lifecycle test requires `INTEGRATION_TEST_MONGODB_URI` and refuses database names without `test`. CI run 76 at commit `81a16a79` passed. The user also reports all 26 unit/API tests, the frontend build, and the MongoDB integration test passed locally on 2026-10-22. A local browser smoke test remains outstanding.
- Dependency security: user verified `nodemailer@10.2.1` installed locally, `npm audit --prefix server` reported `found 0 vulnerabilities`, all 26 unit/API tests passed, the frontend build succeeded, and the MongoDB-backed integration test passed. GitHub Actions run 79 passed after the Nodemailer version update. SMTP delivery and password reset are now locally verified by the user.
- Password-change workflow was added: new and legacy employee accounts without an explicit flag require a first-login change, backend role guards block protected workspace APIs until the temporary password changes, and authenticated users can change passwords from `/change-password` or their dashboard. Change-password validation and lifecycle integration tests were added. GitHub Actions run 110 at commit `4536cc44` passed, including the legacy-user default test; subsequent commits only update README, `.env.example`, and this plan. The user verified Phase 4 locally on 2026-10-23: 40 unit/API tests passed, the build succeeded, and both MongoDB integration tests passed. The Phase 5 rerun and Phase 6 build plus API/integration test suite then passed locally on 2026-10-23; the full browser smoke test remains pending.
- Forgot-password UX was refined after noticing that unknown addresses receive no email but the UI could imply a code had definitely been sent. The API intentionally keeps the response generic to prevent account enumeration; the reset-code screen now explains conditional delivery, suggests checking spam and verifying the address/contacting the payroll administrator, and no longer says the code was definitely sent. Added a regression test asserting an unknown address and an active account in resend cooldown receive the same public status/body. The user verified the reset flow locally; GitHub Actions runs 119–121 passed.
- Local test output on 2026-10-23 exposed a Mongoose buffering-timeout log despite all unit tests passing: the missing-SMTP unit test depended on `process.env.SMTP_HOST`, so a developer's local `.env` could accidentally exercise the database path. Updated the test to temporarily clear the parsed SMTP config, assert the 503 response unconditionally, and restore the original config afterward. The user reran `npm test`: all 32 passed with no timeout log; CI runs 120 and 121 also passed.


- Phase 4 payroll backend is implemented in commits `6cadbf10` and `cbe3f189`. The salary service calculates gross = base salary + monthly allowances and net = gross - monthly deductions using integer INR paise. Active employees are snapshotted into one payroll run per `YYYY-MM` period. Admin APIs support preview, create, list, detail, approve (`draft → approved`) and finalize (`approved → finalized`); employee pay history returns only that employee's own finalized line item. This demo excludes tax, EPF, overtime, bonuses and leave proration, and does not transfer money.
- CI run #123 initially exposed shared-database interference between parallel integration tests. The payroll integration test now uses its own disposable database with a `_payroll` suffix; CI run #124 at commit `cbe3f189` passed the API unit tests, both MongoDB integration tests and the frontend build. The user subsequently verified locally: all 40 tests passed, the frontend production build passed, and both MongoDB integration tests passed.
- Phase 5 simulated transaction backend is implemented in commits `4ebe156a` and `17254331`: transaction model, simulation-only provider adapter, idempotent per-employee transaction records, explicit failure injection for demo tests, recorded retry history, admin transaction API, employee own-transaction history, and a finalization gate requiring all transactions to succeed. CI run #126 caught a route import error, corrected in `17254331`; CI run #127 passed 46 unit/API tests, both MongoDB integration tests, and the frontend build. Phase 5 still needs local verification.

## Resume alignment (based on the uploaded one-page resume, reviewed 2026-10-22)

### Evidence from the current resume
- B.Tech CSE (AI & ML), CGPA 7.8/10 through 4th semester.
- Current stated target: Data Analyst or Python Developer; the user's broader project discussions also include ML Engineer goals.
- Skills listed: Python, SQL, JavaScript, C/C++; Pandas, NumPy, EDA, visualization, Matplotlib, Streamlit; React, HTML, CSS, Flask, Tailwind, REST APIs; Git/GitHub, MongoDB, Jupyter, VS Code, Postman, Vercel and Render.
- Projects already listed: ByteBazaar MERN e-commerce, Indian Startup Intelligence Dashboard (3,000–4,000 records; cleaning/date processing/charts), Moody Player mood-based recommender, Banking Management System.
- Experience includes full-stack internship (Androwebstech) and ML internship at NIELIT, with data preprocessing and content-based movie recommendations. Resume also lists winning Ideathon 2025 (1st of 42 teams).

### What CloudConduction Payroll should prove
- Do not make it just another MERN CRUD app; emphasize business rules, financial correctness, authorization boundaries, idempotency, auditability, test coverage, and measured performance.
- Complete realistic employee + payroll workflows with synthetic data, strict role/owner access and paginated APIs.
- Analytics should use actual persisted records: monthly payroll totals, deductions, departments, and trends; add date/period filters, empty/loading/error states, and downloadable CSV reports. This ties the full-stack project to the user's data-analysis/dashboard experience.
- Add integration tests for auth/permissions and payroll invariants, CI, and a repeatable load-testing report against database-backed endpoints (not just health).
- Only add a Python analytics/forecasting component if it brings a useful, demonstrable capability after core payroll correctness is completed; do not add AI/ML for decoration.
- Measure and report observed benchmark scope, environment, concurrency, error rate and latency; never claim an unsupported number of real users.

### Resume positioning recommendation
- For full-stack roles, position the project around MERN, secure cookie sessions/OTP reset, RBAC, payroll calculation integrity, idempotent simulated transactions, analytics dashboards, test automation and CI.
- For Data Analyst/Python roles, highlight validated data aggregation, payroll trend reporting, CSV export and analytical visualizations; keep the core data logic demonstrable and use Python only when justified.
- Final resume bullet points should be written only after the corresponding features and tests are complete. Do not claim production payroll or real payment processing.

## Approved roadmap additions before Phase 7 (status reconciled 2026-10-27)

These roadmap additions are reconciled against the current repository as of 2026-10-29. Phase 6 is complete, Phase 6.5/6.6 are implemented and verified, and the separately scoped Phase 8 AI Payroll Insights feature is now implemented.

### Phase 6.5 — recurring deductions, unpaid leave and payroll adjustments
- [x] Unpaid-leave policy: same-month start/end range; each Monday–Friday date becomes a day-level request linked to one group; weekends are skipped; one admin decision approves/rejects the entire group; company holidays/custom schedules are not modeled. Monthly divisor is Monday–Friday count, daily rate uses base salary plus allowances, rounding is integer-safe, and fixed deductions are separate.
- [x] Employee self-service date-range request creation and grouped own-request history; admin filter/list shows one row per range and approve/reject decisions update the complete group with notes and audit metadata. Existing single-date API remains compatible.
- [x] Pending requests do not create deductions and block payroll-run creation until resolved.
- [x] New requests and decisions are blocked after a payroll run exists for the period. Shared per-employee/date reservations prevent conflicting unpaid-leave and WFH requests; rejection releases the reservation.
- [x] Payroll preview, draft snapshot, admin run detail, employee history, CSV export and payslip break out fixed monthly deductions and approved unpaid-leave day count/deduction.
- [x] Integer-safe calculation is tested; if fixed plus unpaid-leave deductions exceed gross pay, preview/run creation fails closed instead of creating negative net pay.
- [x] WFH days are not inferred to be unpaid leave. Attendance never causes a deduction; only explicit approved leave requests affect payroll.
- [x] Unit and MongoDB integration coverage added for range validation, weekday expansion, grouped approval, pending-request payroll gate, deduction calculation, and snapshot locks.
- [x] Browser checks reported by the user on 2026-10-27 passed for date-range submission, grouped admin approval/rejection, and payroll-period locking. Payslip/export and final browser regression were also reported passed; pending-run gating and deduction arithmetic are additionally covered by the passing integration test.
- Note: this deterministic formula is for the portfolio demo only and is not a claim of statutory payroll/legal compliance. Latest CI run #289 passed.

### Phase 6.6 — WFH-only attendance MVP
- [x] WFH requests cover one explicit date from today through the next 365 days in the Asia/Kolkata business timezone; past dates remain disallowed. (The calendar had capped selectable dates at 90 days, which blocked some future months such as February; widened to one year.)
- [x] Employee self-service request creation and history; admin list/filter and approve/reject with decision notes and audit metadata.
- [x] Employee check-in/out requires an approved WFH request for the current India business date. Server-generated timestamps are authoritative; client-supplied punch times, employee IDs and extra fields are rejected.
- [x] One attendance record per employee/date is enforced by a unique database index. A shared per-employee/date reservation prevents WFH and unpaid leave from claiming the same date; rejected requests release the reservation.
- [x] Admins can correct a missing check-out once, only with a reason; the record stores who corrected it, when, and why. Completed records cannot be overwritten by this correction endpoint.
- [x] All WFH/attendance and admin routes are role-protected; API and MongoDB adversarial integration tests cover ownership, forged fields, duplicate dates/punches, overlap races, invalid corrections and period locks.
- [x] No office IP/Wi-Fi/public-IP matching, GPS tracking, or biometric attendance. WFH attendance is an application record, not proof of physical location.
- [x] User reported the WFH request/approval and attendance browser workflow passed on 2026-10-27. The passing MongoDB integration test separately covers server timestamps, ownership, shared date reservations/overlap protection, audited checkout correction, and payroll locks.
- Attendance is separate from leave. A missed punch or no attendance record never automatically becomes unpaid leave or a payroll deduction.

### Phase 6.7 — AI Payroll Insights (historical deferral decision, superseded by Phase 8)
- [x] Historical decision: AI Payroll Insights was deferred from Phase 6 and was not part of Phase 6 acceptance criteria.
- [x] The feature was later implemented as a separate Phase 8 increment on 2026-10-29 after the API guardrails, tests and CI checks were added.
- [x] Current design and verification details are recorded in [docs/AI_PAYROLL_INSIGHTS_PLAN.md](AI_PAYROLL_INSIGHTS_PLAN.md).

### Phase 7 — quality and release
- Release hardening started on 2026-10-28 after Phase 6 verification. Unpaid-leave and WFH attendance workflows are implemented and covered by automated tests and user-reported browser checks; Phase 8 AI Payroll Insights was implemented on 2026-10-29. Remaining production checklist items stay open until their own evidence is recorded.
- Reconcile the checklist with the actual repository and CI rather than repeating completed work. Do not claim production readiness from CI or bounded local benchmarks alone.

## Latest user feedback and implementation (2026-10-27)
- Payroll calendar/WFH date selection: expanded the allowable future WFH window from 90 to 365 days so future months, including February, can be selected. Server-side payroll-period locks still apply: a month with an existing payroll run is intentionally locked; completing January should not by itself lock February.
- Unpaid leave: added a same-payroll-month date-range request endpoint, expanded into weekday-level records and one group-level admin decision. Payroll continues to count approved day records, so saved snapshots are not recalculated.
- Employee UX: added responsive sidebar-style navigation (mobile horizontal menu) for Overview, WFH & attendance, Unpaid leave, Payslips and Transactions, while keeping the profile/salary summary above the content.
- Latest verification completed 2026-10-27: GitHub Actions run #289 passed 63 unit/API tests, 4 MongoDB-backed integration tests, and the frontend build. The user reported the remaining browser regression checks passed. Phase 6 is marked verified; AI Payroll Insights is deferred.

## Current status — 2026-10-29

- [x] Phase 6 browser regression was reported passed by the user; the AI insights panel was later added and the user confirmed its offline demo works correctly.
- [x] Phase 7 local checks reported by the user: 77/77 unit/API tests pass; frontend lint reports zero errors and one non-blocking Fast Refresh warning; production build succeeds with a non-fatal large-bundle warning; root/server/client npm audits report zero vulnerabilities.
- [x] Phase 8 AI Payroll Insights is implemented with an admin-only aggregate-only Gemini endpoint, validated structured output, quota-safe failure handling and an offline demo mode that makes no provider request.- [x] Phase 8 AI Payroll Insights is implemented with an admin-only aggregate-only Gemini endpoint, validated structured output, quota-safe failure handling and local offline analysis that makes no provider request.
- [x] Local payout lifecycle is implemented for development/test with processing status, admin-applied deduplicated provider-status events, provider references, event history, retry protection and a production guard.
- [x] User manually verified the local payout lifecycle in the browser: request creation, status events and retry flow work. The latest horizontal overflow fix also works in the browser.
- [ ] RazorpayX is not connected. Do not describe the app as RazorpayX-connected until the official test API is integrated and verified.
- [x] GitHub Actions run [#337](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40863534173) passed on local payout-provider commit `d5cac19`, including dependency audits, lint, API tests, MongoDB-backed integration tests and frontend build.
- [x] GitHub Actions runs [#339](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40865034854) and [#340](https://github.com/shivkumar15/cloudconduction-payroll/actions/runs/40865144190) passed for the horizontal-overflow containment fix; the user confirmed the UI behavior works.
- [ ] The remaining [Phase 7 security release checklist](PHASE_7_SECURITY_RELEASE_CHECKLIST.md) items must be closed with evidence before the app is considered for real employee data or production payroll. It remains a portfolio demo, payments are simulated, and payroll rules are simplified.
- Next useful portfolio task after documentation CI completes: decide whether to deploy a demo or keep it local, then capture screenshots and add a short resume-focused project summary. Do not enable Gemini billing just to demo the UI.

## Future-session resume instructions
Paste/upload this file and say:
> Continue CloudConduction Payroll from `docs/PROJECT_PLAN.md`. Summarize current status and next task. Inspect actual repository and reconcile plan to files/commits before edits. Do not restart or repeat verified work. Implement the next incomplete task, test it, and update the handoff file with changes, results and unverified items.

This document is continuity context, not a substitute for inspecting the real repository. Always reconcile it with repository state before coding.


- Phase 6 UI implementation (verified 2026-10-27): admin workspace `client/src/pages/admin/AdminPayrollPage.jsx` provides preview, draft creation, approval, simulated payments, failed retry, finalization, saved-run chart, filters and transaction CSV; `client/src/pages/admin/AdminDashboard.jsx` shows API-driven metrics; `client/src/pages/employee/EmployeeDashboard.jsx` provides own finalized payroll/transaction history, payslip print / Save as PDF, CSV exports, sidebar navigation, unpaid-leave requests, and WFH attendance. The user reported the full browser regression passed, and GitHub Actions run #289 passed tests and the production build. Historical commits and older local verification notes below are retained as history.

- Local verification update (user-reported 2026-10-23): after `git pull origin main`, `npm run build` succeeded with Vite 6.4.5 and 2,275 modules transformed; output assets were 26.30 kB CSS and 802.64 kB JavaScript (230.98 kB gzip). Vite emitted a non-fatal warning because the minified JavaScript chunk exceeds 500 kB. `npm test` passed all 46 unit/API tests (0 failures); `npm run test:integration --prefix server` passed both MongoDB integration tests (employee lifecycle and payroll lifecycle). These results verify the JSX repair locally. GitHub Actions status for the latest Phase 6 changes and the manual browser workflows are still not confirmed.


- Employment start-date/payroll eligibility correction (2026-10-26): new employees require a valid `YYYY-MM-DD` start date. Payroll preview and draft creation use the same selected-period server filter; employees qualify through the selected month's final millisecond. Legacy records without the new field use `createdAt` as their effective start. Changing a start date is rejected once the employee appears in any saved payroll snapshot, and existing snapshots are not recalculated or modified. GitHub Actions passed at commit `0b2c2d0`; user locally verified 47 unit/API tests, successful Vite production build, and both MongoDB integration tests on 2026-10-26. Manual browser verification remains outstanding; the existing EMP-004 record must be explicitly updated to `2026-12-01` if that is his actual joining date.


- Browser verification update (user-confirmed 2026-10-26): the employment start date change for EMP-004 worked; October/November previews exclude the future joiner and December includes him, as expected. The general Phase 6 payroll workflow smoke test remains in progress. Next: test one all-success run on an unused period, then a separate failure/retry run, and finally employee self-service. Do not recreate or modify finalized October/November runs.

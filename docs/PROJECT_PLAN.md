# CloudConduction Payroll — Project Plan & Continuity Handoff

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
- Use Zod validation, secure authentication, role-based access control, tests, clear setup steps and good documentation.
- Maintain this plan as a continuity file; do not restart completed work.

## Product scope
### Admin
- Overview metrics, payroll totals, deductions, transaction status and period filters.
- Employee CRUD and salary-structure management.
- Payroll preview, approval, processing and history.
- Period locking and duplicate-run prevention.
- Charts and audit trail for sensitive admin actions.
### Employee
- Secure self-service dashboard, own profile and salary history.
- Earnings, bonuses, deductions, net pay, payroll periods and payslips.
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
- [ ] Confirm client production build and `npm test` results specifically.
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
- [ ] Verify actual SMTP delivery and login/reset flow with a local test mailbox.
- [x] Add tests for change-password validation and anonymous-route denial; MongoDB integration verifies mandatory first-login change, blocked workspace access, incorrect/reused password rejection, session invalidation and successful new-password login.
- [ ] Verify SMTP delivery with a test mailbox after configuring provider settings.
- [x] GitHub Actions CI passed for the password-reset UI, OTP utility/API validation tests, Nodemailer dependency and connection-pool/load-test commits; the latest documented-plan run also passed tests and build.
- Acceptance: current automated test/build baseline passes in CI; actual SMTP delivery, true local auth smoke test and load metrics must be verified by developer.
### Phase 3 — employee management
- [x] Employee model with unique employee code/work email, explicit INR currency, status, timestamps and salary structure stored in integer paise.
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
- [ ] Document salary formula and inputs.
- [ ] Pure unit-testable currency service using integer paise.
- [ ] Period model and status transitions.
- [ ] Preview/create/approve/process operations.
- [ ] Unique constraints and concurrency/duplicate handling.
- [ ] Tests for rounding, bad values, over-deductions, duplicates and invalid transitions.
- Acceptance: reproducible calculations and no unintended repeated payroll processing.
### Phase 5 — simulated transactions
- [ ] Simulation adapter isolated from calculation service.
- [ ] Transaction statuses and deterministic test mode.
- [ ] Idempotency and DB constraints.
- [ ] Audit events and failure/retry behavior.
- [ ] Clear simulation labels in UI and README.
- Acceptance: duplicate idempotency request does not duplicate payment; failures are testable/auditable.
### Phase 6 — frontend
- [ ] Login and protected routing.
- [ ] Responsive app shell/navigation.
- [ ] API-driven admin dashboard.
- [ ] Employee dashboard/pay history.
- [ ] Tables, filters, loading/empty/error states.
- [ ] Correctly labeled charts with accessible data equivalents.
- [ ] Payslip view/export.
- [ ] Accessible labels and responsive layouts.
- Acceptance: no misleading data, failure handling, server authorization.
### Phase 7 — quality and release
- [ ] Unit and API integration suite.
- [x] Bounded concurrency smoke-test script (default 25 concurrent workers / 250 health requests).
- [x] User ran local health-endpoint smoke test: target `http://127.0.0.1:5001/api/health`; 250 requests; concurrency 25; 250 succeeded; 0 failed/non-2xx; elapsed 212 ms; measured throughput 1,177.3 requests/second; p50 11.7 ms, p95 46.7 ms, p99 60.1 ms.
- [ ] Add authenticated API performance test with synthetic employees/payroll after those features exist.
- [ ] Client production build/lint.
- [ ] Security regression checklist.
- [ ] Seed script with obviously synthetic data.
- [ ] CI workflow for tests and build.
- [ ] README setup, screenshots, demo instructions and resume summary.
- [ ] Deployment configuration/envs, health checks and log review.
- Acceptance: clean-clone process works, no secrets/real PII, known limitations documented.

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

## Current status — 2026-10-22
- GitHub repository: `https://github.com/shivkumar15/cloudconduction-payroll` (public, default branch `main`; connected account has push/admin access).
- User locally verified Phase 3 on 2026-10-22: `npm test` passed all 26 tests (0 failures); `npm run build` passed (Vite transformed 1,655 modules); and `npm run test:integration --prefix server` passed its MongoDB-backed employee lifecycle test (1 passed, 0 failed).
- Foundation files are committed. Phase 3 adds `server/src/models/Employee.js`, `server/src/utils/money.js`, `server/src/validators/employeeSchemas.js`, `server/src/controllers/employeeController.js`, `server/src/routes/employeeRoutes.js`, and ownership middleware. Routes are mounted at `/api/employees`.
- Authentication API files are committed: `server/src/models/User.js`, `server/src/utils/sessionToken.js`, `server/src/validators/authSchemas.js`, `server/src/middleware/auth.js`, `server/src/middleware/trustedOrigin.js`, `server/src/controllers/authController.js`, `server/src/routes/authRoutes.js`, and `server/src/scripts/seedAdmin.js`.
- Auth routes are mounted in `server/src/app.js`; tests cover anonymous `/me`, malformed login input, missing Origin and untrusted Origin. Ephemeral test servers now await listening/close correctly.
- `server/package.json` contains `seed:admin`. `.env.example` documents optional seed variables; no actual secret values were committed.
- Frontend login UI, Axios API client, session context, protected routes and logout controls are committed. Admin `/admin/employees` supports create/edit/deactivate/reactivate, pagination/search/filters and an initial-password visibility toggle; employee `/employee` loads the linked user's own profile. All current UI password fields now have show/hide controls.
- `.github/workflows/ci.yml` runs backend tests and frontend production build on pushes and PRs.
- No public signup is available. Phase 3 employee API/UI is now implemented on main; payroll and transactions remain pending.
- Password visibility toggle was added to sign-in form; a forgot-password UI now supports requesting an email OTP and setting a new password.
- OTP codes are generated with cryptographic randomness, stored as user-bound HMAC digests, expire after 10 minutes, accept at most 5 wrong code attempts, apply a 60-second resend cooldown, and are consumed via a conditional atomic update. Successful reset increments session version.
- SMTP service uses env-based Nodemailer configuration. Actual SMTP credentials/delivery are not configured or verified yet; reset email cannot work until provider settings are set.
- MongoDB pool configured with max 20/min 2 sockets per server process. Added bounded health-endpoint smoke test, defaults 25 concurrent workers and 250 requests; no load run/actual capacity is claimed yet. Employee APIs are paginated; production multi-instance rate limiting needs a shared store.
- Added tests for OTP helper/reset validation and Phase 3 employee schemas, unique-index definitions, role guard, ownership policy, malformed IDs and unauthenticated routes. The dedicated MongoDB-backed employee lifecycle test requires `INTEGRATION_TEST_MONGODB_URI` and refuses database names without `test`. CI run 76 at commit `81a16a79` passed. The user also reports all 26 unit/API tests, the frontend build, and the MongoDB integration test passed locally on 2026-10-22. A local browser smoke test remains outstanding.
- Dependency security: user verified `nodemailer@10.2.1` installed locally, `npm audit --prefix server` reported `found 0 vulnerabilities`, all 26 unit/API tests passed, the frontend build succeeded, and the MongoDB-backed integration test passed. GitHub Actions run 79 passed after the Nodemailer version update. SMTP credentials/delivery remain unconfigured.
- Password-change workflow was added: new and legacy employee accounts without an explicit flag require a first-login change, backend role guards block protected workspace APIs until the temporary password changes, and authenticated users can change passwords from `/change-password` or their dashboard. Change-password validation and lifecycle integration tests were added. GitHub Actions run 110 at commit `4536cc44` passed, including the legacy-user default test; subsequent commits only update README, `.env.example`, and this plan. The user's local tests/build after pulling these changes and a browser smoke test are still pending.


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

## Immediate next task
1. Pull latest `main` and run `npm install --prefix server`, `npm test`, `npm run build`, and `npm run test:integration --prefix server`.
2. Confirm the latest GitHub Actions run also passes after the documentation/environment example commits.
3. Create a new synthetic employee and confirm first login redirects to `/change-password`; verify role-protected employee API requests are blocked until the password changes.
4. Change the password, confirm the employee reaches their workspace, sign out/in with the new password, and verify the old temporary password no longer works. Test a voluntary password change from the employee workspace too.
5. Configure SMTP in local `server/.env` if email-based Forgot password should work. After a test email is delivered, verify valid/expired/incorrect OTP paths. Never share the SMTP app password or OTPs.
6. Once CI and local checks pass, update this handoff and continue to Phase 4 payroll calculations.

## Future-session resume instructions
Paste/upload this file and say:
> Continue CloudConduction Payroll from `docs/PROJECT_PLAN.md`. Summarize current status and next task. Inspect actual repository and reconcile plan to files/commits before edits. Do not restart or repeat verified work. Implement the next incomplete task, test it, and update the handoff file with changes, results and unverified items.

This document is continuity context, not a substitute for inspecting the real repository. Always reconcile it with repository state before coding.

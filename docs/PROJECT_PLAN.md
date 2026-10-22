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
- [ ] Central requireAuth and requireRole middleware.
- [ ] Employee data ownership enforced server-side.
- [ ] Explicit writable fields; prevent mass assignment.
- [ ] Never trust client-supplied role, salary, net pay, amount, status or employee ID without server checks.
- [ ] Never log password, tokens, cookies or sensitive salary details.
- [ ] Synthetic data only.
### API/infrastructure
- [ ] Validate route params, query and body.
- [ ] Exact CORS origin allowlist; Helmet; body-size caps; rate limiting.
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
- [x] User model with unique normalized email, password hash, role, active flag and session token version.
- [x] Admin seed/provisioning script; no public registration endpoint.
- [x] Login/logout/current-user routes.
- [x] HttpOnly session cookie, eight-hour expiry, SameSite and Secure-in-production settings.
- [x] Session token verification and role middleware.
- [x] Trusted-Origin enforcement on unsafe API methods.
- [x] Email password-reset OTP: SMTP adapter, HMAC code hash, ten-minute expiry, cooldown, attempt limit, single-use reset and invalidation of existing sessions.
- [x] Frontend show/hide password toggle, forgot-password route, reset form, and admin/employee role routes.
- [x] Tests cover anonymous access, malformed login/reset input, OTP shape/HMAC, missing/untrusted origin and absent SMTP configuration.
- [ ] Verify actual SMTP delivery and login/reset flow with a local test mailbox.
- [ ] Add broader tests for successful login, password reset end-to-end, forbidden role and ownership during protected resource development.
- Acceptance: baseline checks pass in CI; real email and full auth smoke test must be verified by developer.
### Phase 3 — employee management
- [ ] Employee model and validation.
- [ ] Admin list/create/update/deactivate APIs and UI.
- [ ] Pagination/filtering and strict writable fields (pagination is required to prevent unbounded list responses).
- [ ] Employee self-service route.
- [ ] Tests for validation, uniqueness, roles and ownership.
- Acceptance: admin manages synthetic employees; employee sees only own record.
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
- [x] Bounded concurrency smoke-test script (default 25 concurrent workers / 250 health requests); execute and record actual metrics before claiming a capacity number.
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
- User reports initial local app/URLs opened successfully without errors. Exact npm test and production build output has not yet been captured.
- Foundation files are committed: root package/README/gitignore; server app/startup/config/middleware/env example/health test; client Vite config and initial dashboard.
- Authentication API files are committed: `server/src/models/User.js`, `server/src/utils/sessionToken.js`, `server/src/validators/authSchemas.js`, `server/src/middleware/auth.js`, `server/src/middleware/trustedOrigin.js`, `server/src/controllers/authController.js`, `server/src/routes/authRoutes.js`, and `server/src/scripts/seedAdmin.js`.
- Auth routes are mounted in `server/src/app.js`; tests cover anonymous `/me`, malformed login input, missing Origin and untrusted Origin. Ephemeral test servers now await listening/close correctly.
- `server/package.json` contains `seed:admin`. `.env.example` documents optional seed variables; no actual secret values were committed.
- Frontend login UI, Axios API client, session context, protected admin/employee routes and logout controls are committed.
- `.github/workflows/ci.yml` runs backend tests and frontend production build on pushes and PRs.
- No public signup is available. Employee/payroll API and features are still pending.
- Password visibility toggle was added to sign-in form; a forgot-password UI now supports requesting an email OTP and setting a new password.
- OTP codes are generated with cryptographic randomness, stored as user-bound HMAC digests, expire after 10 minutes, accept at most 5 wrong code attempts, apply a 60-second resend cooldown, and are consumed via a conditional atomic update. Successful reset increments session version.
- SMTP service uses env-based Nodemailer configuration. Actual SMTP credentials/delivery are not configured or verified yet; reset email cannot work until provider settings are set.
- MongoDB pool configured with max 20/min 2 sockets per server process. Added bounded health-endpoint smoke test, defaults 25 concurrent workers and 250 requests; no load run/actual capacity is claimed yet. Future employee endpoints must be paginated; production multi-instance rate limiting needs a shared store.
- Added tests for OTP helper and reset validation. The latest CI for these new commits is still pending; verify via Actions before claiming the newest changes pass.

## Immediate next task
1. Pull latest `main` (`git pull origin main`) so local files include the password toggle, password-reset page/API, and load smoke test.
2. Run `npm install --prefix server` (for Nodemailer), `npm test`, and `npm run build`; check GitHub Actions after the latest commit and share failures only, not secret values.
3. Test the show/hide password toggle on `/login`.
4. Configure SMTP using your provider's values in local `server/.env`, then request a reset code from `/forgot-password` and verify valid, expired and incorrect OTP behavior. Do not share OTPs or provider credentials.
5. Run `npm run load:test --prefix server` while the backend is running and record the actual result. This tests health endpoint concurrency only, not full payroll capacity.
6. Then implement Phase 3 employee schema and paginated CRUD APIs, employee provisioning/role attachment, and owner-only self-service endpoints.

## Future-session resume instructions
Paste/upload this file and say:
> Continue CloudConduction Payroll from `docs/PROJECT_PLAN.md`. Summarize current status and next task. Inspect actual repository and reconcile plan to files/commits before edits. Do not restart or repeat verified work. Implement the next incomplete task, test it, and update the handoff file with changes, results and unverified items.

This document is continuity context, not a substitute for inspecting the real repository. Always reconcile it with repository state before coding.

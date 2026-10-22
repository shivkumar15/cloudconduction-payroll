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
- [ ] HTTP-only cookie; Secure in production; appropriate SameSite.
- [ ] CSRF protections for cookie-authenticated mutations.
- [ ] Login rate limits and reasonable password policy.
- [ ] Expiry, logout invalidation and secret rotation guidance.
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
- [ ] Commit starter scaffold, this plan and README.
- Acceptance: cloneable monorepo, documented setup, no secrets.
### Phase 1 — foundation
- [x] Initial starter scaffold generated locally (React/Vite/Tailwind, Express/Mongoose connection, health endpoint, baseline security middleware, one health test).
- [ ] Install dependencies and verify.
- [ ] Verify Node/npm/MongoDB setup.
- [ ] Run client and API.
- [ ] Client production build and API test.
- [ ] Add lint/format commands if useful.
- Acceptance: start command, client build, health endpoint and tests all pass. Do not mark complete before verification.
### Phase 2 — authentication and authorization
- [ ] User model/indexes.
- [ ] Admin seed/provisioning script.
- [ ] Login/logout/current-user routes.
- [ ] Secure cookie and CSRF approach.
- [ ] Auth/role middleware.
- [ ] Tests: invalid/valid login, anonymous access, forbidden role, ownership, logout.
- Acceptance: protected routes reject unauthorized requests; client cannot elevate role.
### Phase 3 — employee management
- [ ] Employee model and validation.
- [ ] Admin list/create/update/deactivate APIs and UI.
- [ ] Pagination/filtering and strict writable fields.
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
- Starter scaffold exists in the current artifact workspace and was packaged as `cloudconduction-payroll-complete-plan.zip`.
- Expected starter files include root package/readme/gitignore; server env example, app/server/config/middleware and health test; client Vite config, HTML, main, App and CSS.
- Initial frontend metrics are placeholders intentionally; no fake salary totals shown.
- Base middleware: Helmet, exact-origin CORS via env, request size limits, cookie-parser, API rate limiter.
- Auth and payroll features are not implemented yet.
- Not verified: npm install, startup, test result, production build, browser behavior.
- GitHub repository verified existing and currently empty as of initial inspection; authenticated account has admin/push access.
- This file itself has been committed as the first repository file; publish starter source files next.

## Immediate next task
1. Publish the starter application files and root README/.gitignore/package.json to the GitHub `main` branch, avoiding secrets.
2. Verify each uploaded file on GitHub.
3. User clones repo or extracts ZIP, installs dependencies, configures env and runs app/tests.
4. Capture exact errors/logs and fix Phase 1 before authentication.
5. Update this document after every phase with changed paths, commit reference, test evidence, known issues and next task.

## Future-session resume instructions
Paste/upload this file and say:
> Continue CloudConduction Payroll from `docs/PROJECT_PLAN.md`. Summarize current status and next task. Inspect actual repository and reconcile plan to files/commits before edits. Do not restart or repeat verified work. Implement the next incomplete task, test it, and update the handoff file with changes, results and unverified items.

This document is continuity context, not a substitute for inspecting the real repository. Always reconcile it with repository state before coding.

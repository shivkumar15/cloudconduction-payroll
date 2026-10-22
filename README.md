# CloudConduction Payroll

A portfolio-focused MERN payroll management application. The initial scaffold includes a React/Vite/Tailwind frontend and an Express/Mongoose API foundation. Payroll payments are simulated; this project does not transfer real money.

## Requirements
- Node.js 20+ (use an actively supported version)
- npm
- MongoDB local instance or MongoDB Atlas database

## Setup
1. Install root tools:
   ```bash
   npm install
   ```
2. Install app dependencies:
   ```bash
   npm install --prefix server
   npm install --prefix client
   ```
3. Copy `server/.env.example` to `server/.env` and set a long random `JWT_SECRET`.
4. Start MongoDB, then run:
   ```bash
   npm run dev
   ```
5. API health check: http://localhost:5001/api/health
6. Frontend: http://localhost:5173

## Security notes
- Never commit `.env` files or real employee data.
- Use synthetic data only in development.
- Before production, configure exact frontend origins, HTTPS, secure cookie settings, monitoring, backups, and a production secret manager.
- Payroll is simulated only; do not use this starter to process real payroll or hold real employee financial data without a formal security/compliance review.

## Project continuity plan
See [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) for the full roadmap, security checklist, acceptance criteria, and instructions for resuming in future sessions.

## Current capabilities
- Foundation: React/Vite/Tailwind dashboard and Express/Mongoose API health endpoint.
- Authentication API: login, logout, current-user lookup, password hashing, role middleware, trusted-origin checks, one-time admin provisioning, and authenticated password change.
- All frontend password-entry fields have accessible show/hide controls: sign-in, password reset, confirmation, employee initial password, and password change. New employee logins are forced to change the admin-issued temporary password before accessing protected employee APIs.
- Email OTP password reset is implemented: six-digit code, 10-minute expiry, HMAC-stored code hash, resend cooldown, attempt limit, generic account response, and session invalidation after reset. SMTP must be configured separately for emails to be delivered.
- A newly created employee receives a temporary initial password and is required to change it at first sign-in. Employee/admin users can also change their password later from their workspace. Password changes require the current password, a new password of at least 12 characters, invalidate other sessions, and issue a fresh session to the current browser.
- SMTP must be configured before password-reset email delivery can work. With no SMTP configuration, the request endpoint returns an explicit server-configuration error.
- Phase 3 employee management: employee model, salary-structure validation, admin CRUD/deactivation APIs, pagination/search/filtering, employee login provisioning, and employee self-service profile API/UI are implemented. A MongoDB-backed API lifecycle integration test is included. GitHub Actions run 110 passed the current password-change/test/build code at commit `4536cc44`; run local checks after pulling the latest documentation/env examples, and complete the browser smoke test.
- Phase 4 payroll backend: integer-paise monthly salary calculations, payroll preview, immutable salary snapshots, one run per month, admin approval/finalization, and employee-only finalized pay history. Simulated payout execution, payslip export and payroll UI are still planned for later phases.



## Payroll calculation demo rules

This portfolio demo uses a deliberately simplified monthly formula:

- Gross pay = base salary + monthly allowances.
- Net pay = gross pay - monthly deductions.
- All amounts are integer INR paise. API clients must not send calculated gross/net values; the server calculates them from stored employee salary structures.
- Only active employees are included when a payroll run is created. Employee salary/name/department fields are snapshotted into the run, so later profile edits do not silently rewrite a previously created payroll period.
- A period uses YYYY-MM format. Only one payroll run is allowed per period. The admin flow is draft → approved → finalized; finalization records an immutable payroll snapshot for the employee's own pay-history endpoint.
- This demo formula does not calculate income tax, EPF, statutory deductions, overtime, bonuses or unpaid-leave proration. It is not a legal/tax-compliant payroll engine and does not transfer money.

Payroll API endpoints:
- GET /api/payroll?period=YYYY-MM — list payroll runs (admin).
- POST /api/payroll/preview with { "period": "YYYY-MM" } — calculate without saving (admin).
- POST /api/payroll/runs with { "period": "YYYY-MM" } — create a draft snapshot (admin).
- GET /api/payroll/runs/:id — inspect a run (admin).
- POST /api/payroll/runs/:id/approve — move draft to approved (admin).
- POST /api/payroll/runs/:id/finalize — move approved to finalized (admin).
- GET /api/payroll/me — read only the authenticated employee's finalized item.

## Password change and temporary employee passwords

When an admin creates an employee, the system stores a bcrypt password hash in the separate `users` collection and marks the account `mustChangePassword: true`. Legacy employee records without this field also receive a role-aware default that requires a password change; admins default to no forced change. The employee can sign in with the temporary password, but the frontend sends them to `/change-password`, and role-protected employee APIs reject workspace access until the password is changed.

The employee or admin can later select **Change password** from their workspace. The form requires the current password, a new password (minimum 12 characters), and confirmation. The API verifies the current password, rejects reuse of the same password, stores a new hash, clears the mandatory-change flag, increments the session version to invalidate other active sessions, and sets a fresh session cookie in the current browser. The administrator cannot retrieve the resulting password.

Endpoint: `POST /api/auth/change-password`

```json
{
  "currentPassword": "the-current-temporary-or-personal-password",
  "newPassword": "a-new-unique-password"
}
```

The confirmation field is validated in the UI and is not sent to the server. Password change is authenticated and does not depend on SMTP.

**Forgot password is different:** the user is not signed in, so the application sends a one-time email code before allowing a reset. That flow will return a configuration error until SMTP variables are filled in the local `server/.env`. Never commit or share the SMTP app password.

## Phase 3 — employee management

Open the admin workspace and choose **Manage employees**, or navigate to `/admin/employees` after admin login.

### API routes

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/employees?page=1&pageSize=10&q=rahul&department=Engineering&employmentStatus=active` | Admin | Paginated list/search/filter |
| POST | `/api/employees` | Admin | Create an employee and linked employee login |
| GET | `/api/employees/me` | Employee | Return the signed-in employee's own profile |
| GET | `/api/employees/:id` | Admin or that employee | Read one record with server-side ownership enforcement |
| PATCH | `/api/employees/:id` | Admin | Update name, department, designation, salary structure or status |
| DELETE | `/api/employees/:id` | Admin | Deactivate employee and invalidate their active sessions |

Employee creation requires `employeeCode`, `firstName`, `lastName`, `workEmail`, `department`, `designation`, `salaryStructure`, and an `initialPassword` of at least 12 characters. The new account is always assigned the employee role by the server; request bodies cannot assign admin access. There is no public registration endpoint.

Example request body (all people and numbers below are synthetic demo values):

```json
{
  "employeeCode": "EMP-1001",
  "firstName": "Rahul",
  "lastName": "Kumar",
  "workEmail": "rahul@example.com",
  "department": "Engineering",
  "designation": "Software Engineer",
  "salaryStructure": {
    "baseSalaryPaise": 2500000,
    "monthlyAllowancesPaise": 300000,
    "monthlyDeductionsPaise": 200000
  },
  "initialPassword": "use-a-unique-password"
}
```

Monetary fields are integer paise at the API/database boundary (₹25,000 is 2,500,000 paise). The UI accepts rupee input and converts it to paise. Employee records explicitly store currency as INR, which is the only supported currency in this version. Deductions cannot exceed base salary plus allowances. This is a demo salary structure—not a statutory tax calculation or final payslip.

Employee code and work email are normalized and unique. The work email is also the linked login identity and is immutable through the employee update endpoint. Employee listing is bounded to at most 100 records per page. Search input is escaped before being used as a regular expression. Employee self-service resolves the linked employee ID from the authenticated account; the API does not trust a client-supplied employee ID for `/me`.

Deactivation sets the employee record to inactive, disables its linked login, and increments the account's token version to invalidate existing sessions. An admin can reactivate a record from its edit form. Account provisioning uses compensating cleanup if creating the login fails; it is not a multi-document MongoDB transaction, so production-grade provisioning would need transaction-capable infrastructure or a durable reconciliation workflow.

Do not use real employee data. Share an initial password separately, never through logs or source control. Email-based password reset requires the SMTP setup described above.

## Authentication API (development)
There is no public registration endpoint. Create a development admin explicitly:

1. Add these values only to your local `server/.env` file (not GitHub):
   ```dotenv
   SEED_ADMIN_EMAIL=admin@example.com
   SEED_ADMIN_PASSWORD=use-a-unique-password-at-least-12-chars
   ```
2. Run once from the repository root:
   ```bash
   npm run seed:admin --prefix server
   ```
3. Remove the `SEED_ADMIN_PASSWORD` value from `server/.env` after successful provisioning.
4. Login endpoint: `POST /api/auth/login` with JSON `{ "email": "...", "password": "..." }`.
5. Current user: `GET /api/auth/me` using the session cookie. Logout: `POST /api/auth/logout`.

Unsafe methods require an `Origin` header that exactly matches `CLIENT_ORIGIN`; browser requests from the configured frontend should include it. Cookies are HttpOnly, have SameSite=Lax, and are marked Secure when `NODE_ENV=production`. For deployment, keep frontend/API same-site when feasible, use HTTPS, and review CSRF/session settings before real user data is introduced.

## Verification
From the repository root:
```bash
npm test
npm run build
```
The API unit/route tests load the backend environment config, so ensure `server/.env` is configured first. The database-backed employee lifecycle test is separate and requires MongoDB to be running and reachable through `INTEGRATION_TEST_MONGODB_URI`. Set this to a dedicated database name containing `test` (for example, `mongodb://127.0.0.1:27017/cloudconduction_payroll_test`) in your local `server/.env`. The test refuses a target database whose name does not include `test`; do not point it at a real/application database:

```bash
npm run test:integration --prefix server
```

GitHub Actions run 76 at commit `81a16a79` passed the unit/route tests, MongoDB-backed employee lifecycle integration test, and frontend production build. The developer also reported locally passing all 26 unit/API tests, the production build, and the 1-test MongoDB integration suite on 2026-10-22. The local admin/employee browser smoke test remains outstanding. The user identified high-severity advisories affecting Nodemailer in version 7.x. `server/package.json` was updated to `^10.2.1`. The user verified `npm ls nodemailer --prefix server` reports `nodemailer@10.2.1`, `npm audit --prefix server` reports 0 vulnerabilities, all 26 unit/API tests pass, the frontend production build succeeds, and the MongoDB-backed employee integration test passes. GitHub Actions run 79 at the dependency-upgrade commit also passed. SMTP delivery remains unverified until actual provider settings are configured; the local admin/employee browser smoke test is the remaining Phase 3 check.


### Example: Gmail or Google Workspace SMTP

For a Gmail sender account, enable 2-Step Verification and create an **App Password** in the Google Account security settings. App Passwords require 2-Step Verification and may not be available on some managed/advanced-protection accounts. Use the generated app password, not your ordinary Google account password. See [Google's App Password help](https://support.google.com/accounts/answer/185833) and [Gmail SMTP setup](https://support.google.com/a/answer/176600).

Example values for your local `server/.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-sender-address@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM=your-sender-address@gmail.com
```

Save the file and restart the server. The `SMTP_USER` and `MAIL_FROM` should be the authorized sender account/address. Keep the real app password only in your ignored local `server/.env`; never commit it, paste it into chat, or use your normal Google password.

## Password reset email configuration

Password reset uses SMTP via Nodemailer. Add the following to your local `server/.env` (never commit real values):

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-provider-username
SMTP_PASS=your-provider-password-or-api-key
MAIL_FROM=no-reply@your-verified-domain.example
```

Use the SMTP settings provided by your email provider; sender addresses often need provider/domain verification. With STARTTLS on port 587, `SMTP_SECURE=false` is common; for implicit TLS on port 465, use `SMTP_SECURE=true`. Do not use your ordinary email password if the provider requires an app password or API key.

The reset request endpoint is `POST /api/auth/password-reset/request` with `{ "email": "..." }`. Confirm the code using `POST /api/auth/password-reset/confirm` with `{ "email": "...", "otp": "123456", "newPassword": "..." }`. Reset codes are one-time and expire in 10 minutes. Never print or log the OTP.

## Concurrent users and load smoke test

The app is not restricted to a single user: each account has a unique normalized email, the signed session identifies the relevant account, and auth requests load the account from MongoDB. Mongoose is configured with a connection pool of up to 20 sockets per server process. Employee listing will be paginated before employee records are implemented.

To run a bounded smoke test against the health endpoint, start MongoDB and the backend first, then open another terminal:

```bash
npm run load:test --prefix server
```

By default it sends 250 requests with up to 25 concurrent workers. You can override it (PowerShell example):

```powershell
$env:LOAD_TEST_CONCURRENCY="25"
$env:LOAD_TEST_REQUESTS="250"
npm run load:test --prefix server
```

This is a basic health-endpoint concurrency smoke test, **not** a proof of production capacity or a full authenticated payroll benchmark. Record the results and later load-test authenticated employee/payroll APIs against synthetic data. The default per-process in-memory rate limiter is suitable only for a single-process demo; multi-instance production requires a shared rate-limit store (for example Redis) and measured deployment capacity.


## Local health-endpoint smoke test

The bounded script can be run with the backend serving `/api/health`:

```bash
npm run load:test --prefix server
```

A developer-reported run on a local Windows environment (2026-10-22) completed 250 requests at concurrency 25: 250 successful, 0 failed/non-2xx, 212 ms elapsed, reported 1,177.3 requests/second, p50 11.7 ms, p95 46.7 ms and p99 60.1 ms. This is a local health-endpoint smoke test only; it does not use MongoDB-backed routes and must not be interpreted as supported user capacity. Benchmark employee/payroll APIs separately after implementation.

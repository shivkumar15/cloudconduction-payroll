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
- Authentication API: login, logout, current-user lookup, password hashing, role middleware, trusted-origin checks, and one-time admin provisioning.
- Frontend sign-in has an accessible show/hide password toggle. Protected routes separate admin and employee workspaces.
- Email OTP password reset is implemented: six-digit code, 10-minute expiry, HMAC-stored code hash, resend cooldown, attempt limit, generic account response, and session invalidation after reset.
- SMTP must be configured before password-reset email delivery can work. With no SMTP configuration, the request endpoint returns an explicit server-configuration error.
- Employee management, payroll processing, simulated transaction execution, and analytics APIs are not implemented yet.

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
The API tests load the backend environment config, so ensure `server/.env` is configured first. GitHub Actions runs the API tests and frontend production build on pushes and pull requests; check the Actions tab for verified results. The authentication changes still need local end-to-end verification.


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

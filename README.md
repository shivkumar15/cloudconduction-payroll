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
- Frontend login form is connected to the API client and session context. Protected routes separate admin and employee workspaces.
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

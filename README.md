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
This is the starter scaffold only. Authentication, employee records, payroll processing, payment transactions, and analytics APIs are not implemented yet.

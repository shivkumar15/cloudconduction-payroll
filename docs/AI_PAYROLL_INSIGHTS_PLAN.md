# AI Payroll Insights — Implementation Plan

**Status:** Implemented and verified for the portfolio demo (2026-10-29). The aggregate-only metrics builder, admin-only Gemini endpoint, output validation, quota-safe errors, admin UI and offline no-API demo mode are committed. The user confirmed the offline demo works. The latest GitHub Actions CI run #331 passed; the real Gemini provider may still return HTTP 429 when its free-tier quota is exhausted.

## Goal

Add an **admin-only AI Payroll Insights** panel that explains trends in selected finalized payroll periods using aggregate metrics already calculated by the application. It is advisory information for a portfolio demo, not a payroll authority.

## Initial MVP scope

- A period selector for a finalized payroll period.
- A server-computed aggregate summary for the selected period, optionally compared with the previous finalized period.
- AI-generated summary, observations, potential anomalies to review, and suggested administrative checks.
- Clear statement that insights are AI-generated and must be reviewed by an admin.
- Graceful states for disabled configuration, API timeout, quota/rate-limit errors, provider errors, and missing finalized data.

## Safety and architecture requirements

1. **Admin-only:** Reuse existing session authentication and server-side admin role checks. Frontend visibility alone is not authorization.
2. **Read-only:** The model must not create or update employees, edit salaries, calculate authoritative wages, create/approve/finalize payroll runs, approve leave/WFH, or change simulated transaction statuses.
3. **Aggregate-only input:** The backend query projects only the payroll period, currency, employee count, and aggregate gross/deductions/net totals. Do not send employee names, emails, employee IDs, individual salary lines, payslip contents, reset tokens, attendance records, or raw database documents.
4. **Deterministic financial values:** Gross pay, deductions, net pay, period totals, counts, and change percentages come from existing tested application code. The AI explains the supplied values but must not replace or recalculate them.
5. **Constrained output:** Require a small JSON object with summary, observations, itemsToReview, and limitations; validate it with Zod before returning it to the client. Treat model text as untrusted.
6. **Free-tier spend safety:** Keep Google Cloud billing disabled. Pin the integration to gemini-3.8-flash, listed in Google's current Gemini API pricing documentation as having free input/output token pricing. Do not configure automatic fallback to another model, use search grounding or paid-only tools, enable billing, or add credits. Free-tier availability and quotas remain subject to Google's eligibility and rate limits; if Google denies access or the free quota is exhausted, fail safely and show an error rather than switching to a paid model.
7. **Secrets:** Use a server-only GEMINI_API_KEY in server/.env locally and host secret settings on deployment. Never expose it in React, any VITE_* variable, Git, browser responses, or logs.
8. **Limits:** Apply an endpoint rate limit, an upstream timeout, bounded output size, and output validation. Do not call the provider when the key is absent.
9. **Privacy and logs:** Do not persist prompts or provider payloads by default. Log only minimal operational metadata and sanitized error categories.
10. **Reliability:** AI failure or invalid output must not affect payroll, transaction, attendance, or leave workflows.
11. **Honest UI:** Label the result as AI-generated advisory information, identify the period covered, and state that it is not tax/legal advice or a compliance determination.

## Integration shape

Admin UI -> authenticated Express endpoint -> aggregate-only database projection -> deterministic metrics builder -> Gemini structured JSON response -> Zod validation -> UI.

The integration uses the official @google/genai Node.js SDK and Gemini Interactions API structured outputs:
- [Google GenAI SDK libraries](https://ai.google.dev/gemini-api/docs/libraries)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

Do not add function calling, database tools, search grounding, or model-triggered write actions for this MVP.

## Implementation sequence

1. Aggregate-only metrics builder and unit tests — committed and passing.
2. Add Gemini SDK, optional server-only API key, pinned free-tier model, and structured-output service — in progress.
3. Add authenticated, admin-only endpoint with strict period validation, projection-only database reads, request limit, timeout, and safe errors.
4. Add the admin UI panel and loading, empty, disabled, timeout, quota, and error states.
5. Add tests proving anonymous/employee denial, absence of PII from provider input, strict output validation, no business-record mutation, and unchanged payroll calculations.
6. Verification completed for this implementation: the user reports 77/77 local unit/API tests passing, local lint with zero errors and one non-blocking warning, successful production build, and zero reported root/server/client audit vulnerabilities. GitHub Actions CI run #331 passed, including the configured CI verification steps. The user also manually confirmed that the offline demo renders correctly without an API request. A live Gemini request remains quota-dependent; no paid billing is enabled.

## Acceptance criteria

- Employees and anonymous users cannot access the insight endpoint.
- Only the minimum required aggregate metrics are retrieved and sent to Gemini.
- The model has no tools and cannot mutate application records.
- Returned data follows the declared schema and is displayed safely as text.
- Missing API key, timeout, provider failure, quota/rate limit, unavailable free-tier access, malformed output, and invalid period are handled gracefully.
- The backend never changes payroll calculations or payroll/transaction state transitions.
- Tests run in CI without a provider key or external API call.
- Use of paid billing is not required; the model is pinned and failures do not trigger paid-model fallback.
- The offline demo path displays labelled, deterministic aggregate insights without sending a request to Gemini.
- The application remains explicitly a portfolio demo with simulated payments only.

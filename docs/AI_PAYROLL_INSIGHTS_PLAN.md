# AI Payroll Insights — Implementation Plan

**Status:** Planned next feature phase; not implemented yet.

The original AI Payroll Insights item was deliberately deferred from Phase 6 so that it would not be represented as shipped or verified before implementation and tests. The project owner has now reaffirmed that AI integration is part of the intended application roadmap. Build this as a separate feature after the current Phase 7 lint/CI and release-hardening state is reconciled.

## Goal

Add an **admin-only AI Payroll Insights** panel that explains trends in selected payroll periods using aggregate metrics already calculated by the application. It is an advisory feature for a portfolio demo, not a payroll authority.

## Initial MVP scope

- A period selector for a finalized payroll period.
- A server-computed aggregate summary for the selected period, optionally compared with the previous available period.
- AI-generated summary, observations, potential anomalies to review, and suggested administrative checks.
- Clear statement that insights are AI-generated and must be reviewed by an admin.
- Graceful, user-friendly states for disabled configuration, API timeout, provider errors, and no available data.

## Safety and architecture requirements

1. **Admin-only:** Reuse existing session authentication and server-side admin role checks. Frontend visibility alone is not authorization.
2. **Read-only:** The model must not be able to create or update employees, edit salaries, calculate authoritative wages, create/approve/finalize payroll runs, approve leave/WFH, or change simulated transaction statuses.
3. **Aggregate-only input:** Compute metrics in the backend and send only the minimum necessary aggregate JSON to the model. Do not send employee names, emails, employee IDs, individual salary lines, payslip contents, reset tokens, attendance records, or raw database documents.
4. **Deterministic financial values:** Gross pay, deductions, net pay, period totals, counts, and rate calculations come from the existing tested application code. The AI may explain supplied numbers but must not replace or recalculate them.
5. **Constrained output:** Require a small JSON object such as `summary`, `observations`, `itemsToReview`, and `limitations`; validate it with the server's existing Zod dependency before returning it to the client. Treat all model output as untrusted text.
6. **Secrets and cost:** Use a server-only provider key in `server/.env` for local development and host secret settings for deployment. Never expose it in client code, any `VITE_*` variable, Git, browser responses, or logs. Add request limits, a timeout, bounded output length, and a simple generation cooldown or rate limit. Do not call the provider if the key is absent.
7. **Privacy and logs:** Do not persist prompts or complete provider payloads by default. Log only minimal operational metadata and sanitized error categories.
8. **Reliability:** AI outage or invalid output must not affect payroll, transaction, attendance, or leave workflows.
9. **Honest UI:** Label the panel as AI-generated advisory information, show the period covered, and state that it is not tax/legal advice or a compliance determination.

## Recommended integration shape

`Admin UI -> authenticated Express endpoint -> server computes aggregate metrics -> provider adapter -> schema-validated insight JSON -> UI`

Use a server-side API provider adapter so the provider can be changed later. The initial implementation can use the OpenAI Responses API with structured outputs, if the owner chooses OpenAI and configures an API key. Official references:
- [OpenAI API overview and API-key security](https://developers.openai.com/api/reference/overview)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Responses API create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)

Do not add function calling, database tools, or model-triggered write actions for this MVP.

## Implementation sequence

1. Reconcile and confirm the Phase 7 lint command/CI step is actually committed and passing.
2. Add a provider-agnostic insight service and a deterministic aggregate-metrics builder with unit tests.
3. Add the authenticated, admin-only endpoint with strict input validation, request limits, timeout handling, and safe errors.
4. Add provider integration behind the service adapter, using a structured output schema and a server-side secret. Unit tests must mock the provider; automated CI must not require a real API key or make paid API calls.
5. Add the admin UI panel and loading, empty, disabled, timeout, and error states.
6. Add tests that prove employee-role denial, absence of PII from provider input, strict output validation, no business-record mutation, and no change to payroll calculations.
7. Verify unit/API tests, MongoDB integration tests, dependency audits, lint, and production build. Then run manual browser checks with synthetic data.

## Acceptance criteria

- Employees and anonymous users cannot access the insight endpoint.
- Only the minimum required aggregate metrics are passed to the model.
- The model cannot access tools or mutate application records.
- Returned data follows the declared schema and is displayed safely as text.
- Missing API key, provider timeout, provider failure, refusal, malformed/empty result, and invalid period are handled gracefully.
- Payroll calculations and all payroll/transaction state transitions remain unchanged.
- Tests run in CI without a provider API key or external API call.
- The feature remains explicitly advisory and the overall app remains a portfolio demo with simulated payments only.

import "dotenv/config";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5001";
const DEFAULT_FRONTEND_ORIGIN = "http://localhost:5173";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ITERATIONS = 30;
const MAX_CONCURRENCY = 8;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to your local server/.env; never commit credentials.`);
  }
  return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function currentIndiaPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year + "-" + month;
}

function parsePeriod(value) {
  if (typeof value !== "string" || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("API_PERF_PERIOD must use YYYY-MM format with a valid month.");
  }
  return value;
}

function parseOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid origin URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an origin only, with no credentials, path, query or fragment.`);
  }
  return url;
}

function validateTarget() {
  const base = parseOrigin(process.env.API_PERF_BASE_URL || DEFAULT_API_BASE_URL, "API_PERF_BASE_URL");
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (isLoopback) return base.origin;

  const explicitlyAllowed = process.env.API_PERF_ALLOW_REMOTE === "true" &&
    process.env.API_PERF_CONFIRM_OWNED_STAGING === "true";
  if (!explicitlyAllowed) {
    throw new Error(
      "Remote benchmark targets are blocked. Use localhost, or for an authorized HTTPS staging instance set both API_PERF_ALLOW_REMOTE=true and API_PERF_CONFIRM_OWNED_STAGING=true."
    );
  }
  if (base.protocol !== "https:") {
    throw new Error("Remote benchmark targets must use HTTPS.");
  }
  return base.origin;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function cookiePairFrom(response) {
  const rawCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const pair = rawCookies
    .map((cookie) => cookie.split(";")[0])
    .find((cookie) => cookie.startsWith("ccp_session="));
  if (!pair) {
    throw new Error("Login succeeded but no ccp_session cookie was present. Check auth configuration.");
  }
  return pair;
}

async function login(baseUrl, origin, email, password) {
  const response = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": origin,
      "Accept": "application/json",
      "User-Agent": "CloudConductionPayroll-AuthenticatedApiPerf/1.0"
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    await response.arrayBuffer().catch(() => {});
    throw new Error(`Admin login failed with HTTP ${response.status}. Check the local test account and CLIENT_ORIGIN; response details are intentionally not logged.`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  await response.arrayBuffer();
  if (!contentType.includes("application/json")) {
    throw new Error("Admin login returned a non-JSON response; benchmark stopped.");
  }
  return cookiePairFrom(response);
}

const baseUrl = validateTarget();
const originUrl = parseOrigin(
  process.env.API_PERF_ORIGIN || process.env.CLIENT_ORIGIN || DEFAULT_FRONTEND_ORIGIN,
  "API_PERF_ORIGIN"
);
const origin = originUrl.origin;
const email = requiredEnv("API_PERF_ADMIN_EMAIL");
const password = requiredEnv("API_PERF_ADMIN_PASSWORD");
const period = parsePeriod(process.env.API_PERF_PERIOD || currentIndiaPeriod());
const iterations = boundedInteger("API_PERF_ITERATIONS", 10, 1, MAX_ITERATIONS);
const concurrency = boundedInteger("API_PERF_CONCURRENCY", 4, 1, MAX_CONCURRENCY);

const operations = [
  { name: "employee-list", method: "GET", path: "/api/employees?page=1&pageSize=10" },
  { name: "payroll-list", method: "GET", path: "/api/payroll?period=" + encodeURIComponent(period) },
  { name: "transaction-list", method: "GET", path: "/api/transactions?period=" + encodeURIComponent(period) },
  {
    name: "payroll-preview",
    method: "POST",
    path: "/api/payroll/preview",
    body: { period }
  }
];

const results = Object.fromEntries(operations.map((operation) => [
  operation.name,
  { requested: 0, succeeded: 0, failed: 0, durations: [], failureKinds: {} }
]));

async function benchmarkRequest(operation, cookie) {
  const record = results[operation.name];
  record.requested += 1;
  const started = performance.now();

  try {
    const headers = {
      "Cookie": cookie,
      "Origin": origin,
      "Accept": "application/json",
      "User-Agent": "CloudConductionPayroll-AuthenticatedApiPerf/1.0"
    };
    const options = {
      method: operation.method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    };
    if (operation.body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(operation.body);
    }

    const response = await fetch(baseUrl + operation.path, options);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    await response.arrayBuffer();
    const elapsed = performance.now() - started;
    record.durations.push(elapsed);

    const succeeded = response.ok && contentType.includes("application/json");
    if (succeeded) {
      record.succeeded += 1;
    } else {
      record.failed += 1;
      const failureKind = response.ok ? "non-json-response" : "http-" + response.status;
      record.failureKinds[failureKind] = (record.failureKinds[failureKind] || 0) + 1;
    }
  } catch (error) {
    record.durations.push(performance.now() - started);
    record.failed += 1;
    const failureKind = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "timeout"
      : "network-error";
    record.failureKinds[failureKind] = (record.failureKinds[failureKind] || 0) + 1;
  }
}

async function main() {
  const cookie = await login(baseUrl, origin, email, password);
  const tasks = Array.from({ length: iterations }, () => operations).flat();
  let nextIndex = 0;
  const started = performance.now();

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      await benchmarkRequest(tasks[index], cookie);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );

  const elapsedMs = performance.now() - started;
  const totalRequested = Object.values(results).reduce((sum, item) => sum + item.requested, 0);
  const totalSucceeded = Object.values(results).reduce((sum, item) => sum + item.succeeded, 0);
  const totalFailed = Object.values(results).reduce((sum, item) => sum + item.failed, 0);

  console.log("CloudConduction Payroll authenticated API performance smoke test");
  console.log("Target: " + baseUrl);
  console.log("Payroll period: " + period);
  console.log("Iterations per endpoint: " + iterations + "; concurrency: " + concurrency);
  console.log("Scope: authenticated list endpoints and non-persisting payroll preview only.");
  console.log("Mutating business records: none; no payroll runs or simulated payment transactions are created.");
  console.log("Overall: " + totalRequested + " requests; " + totalSucceeded + " successful; " + totalFailed + " failed.");
  console.log("Elapsed: " + elapsedMs.toFixed(1) + " ms; throughput: " +
    (totalRequested / Math.max(elapsedMs / 1000, 0.001)).toFixed(1) + " req/s");
  console.log("");
  console.log("Endpoint                 Requests  Pass  Fail   p50 ms   p95 ms   p99 ms  Failure types");

  for (const operation of operations) {
    const item = results[operation.name];
    const failureSummary = Object.entries(item.failureKinds)
      .map(([kind, count]) => kind + ":" + count)
      .join(", ") || "—";
    console.log(
      operation.name.padEnd(25) +
      String(item.requested).padStart(8) +
      String(item.succeeded).padStart(6) +
      String(item.failed).padStart(6) +
      percentile(item.durations, 0.50).toFixed(1).padStart(9) +
      percentile(item.durations, 0.95).toFixed(1).padStart(9) +
      percentile(item.durations, 0.99).toFixed(1).padStart(9) +
      "  " + failureSummary
    );
  }

  console.log("");
  console.log("This bounded smoke test is not a production-capacity guarantee. Results depend on the local test environment and synthetic dataset size.");
  if (totalFailed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error("API performance smoke test stopped: " + (error?.message || "unknown error"));
  process.exitCode = 1;
}

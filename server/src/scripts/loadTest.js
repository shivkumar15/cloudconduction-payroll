const target = process.env.LOAD_TEST_URL || "http://127.0.0.1:5001/api/health";
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || "25", 10);
const totalRequests = Number.parseInt(process.env.LOAD_TEST_REQUESTS || "250", 10);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error("LOAD_TEST_CONCURRENCY must be an integer from 1 to 100.");
}
if (!Number.isInteger(totalRequests) || totalRequests < 1 || totalRequests > 5000) {
  throw new Error("LOAD_TEST_REQUESTS must be an integer from 1 to 5000.");
}

const durations = [];
let nextRequest = 0;
let succeeded = 0;
let failed = 0;

async function worker() {
  while (true) {
    const requestNumber = nextRequest++;
    if (requestNumber >= totalRequests) return;

    const start = performance.now();
    try {
      const response = await fetch(target, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "CloudConductionPayroll-LoadSmokeTest/1.0" }
      });
      const elapsed = performance.now() - start;
      durations.push(elapsed);

      if (response.ok) {
        succeeded += 1;
      } else {
        failed += 1;
        await response.arrayBuffer().catch(() => {});
      }
    } catch {
      durations.push(performance.now() - start);
      failed += 1;
    }
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

const startTime = performance.now();
await Promise.all(
  Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker())
);
const totalMs = performance.now() - startTime;
durations.sort((a, b) => a - b);

console.log("CloudConduction Payroll bounded API load smoke test");
console.log(`Target: ${target}`);
console.log(`Requests: ${totalRequests}; concurrency: ${concurrency}`);
console.log(`Successful: ${succeeded}; failed/non-2xx: ${failed}`);
console.log(`Elapsed: ${Math.round(totalMs)} ms; throughput: ${(totalRequests / (totalMs / 1000)).toFixed(1)} req/s`);
console.log(`Latency p50/p95/p99: ${percentile(durations, 0.50).toFixed(1)} / ${percentile(durations, 0.95).toFixed(1)} / ${percentile(durations, 0.99).toFixed(1)} ms`);

if (failed > 0) process.exitCode = 1;

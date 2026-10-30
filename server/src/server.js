import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";

let server;

async function start() {
  if (env.NODE_ENV === "production" && env.ENABLE_LOCAL_PAYOUT_TESTS) {
    console.warn(
      "[SAFETY] ENABLE_LOCAL_PAYOUT_TESTS is enabled in production. Payout references and status events are synthetic; no bank or payment gateway is contacted and no money is transferred."
    );
  }
  await connectDatabase();
  server = app.listen(env.PORT, () => {
    console.info(`API listening on port ${env.PORT}`);
  });
}

async function shutdown(signal) {
  console.info(`${signal} received; shutting down`);
  if (server) {
    server.close(async () => {
      const mongoose = await import("mongoose");
      await mongoose.default.connection.close();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((error) => {
  console.error("Failed to start API:", error);
  process.exit(1);
});

import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireTrustedOriginForUnsafeMethods } from "./middleware/trustedOrigin.js";
import authRoutes from "./routes/authRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import payrollRoutes from "./routes/payrollRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import unpaidLeaveRoutes from "./routes/unpaidLeaveRoutes.js";
import wfhRoutes from "./routes/wfhRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import aiPayrollInsightsRoutes from "./routes/aiPayrollInsightsRoutes.js";

export const app = express();

const clientDistPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
const clientIndexPath = resolve(clientDistPath, "index.html");
// Keep the API-only deployment working until the combined Render build includes client/dist.
const hasBuiltClient = existsSync(clientIndexPath);

app.disable("x-powered-by");
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);

app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Requested-With"]
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

app.use("/api", requireTrustedOriginForUnsafeMethods);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CloudConduction Payroll API is healthy"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/unpaid-leave", unpaidLeaveRoutes);
app.use("/api/wfh", wfhRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/ai-insights", aiPayrollInsightsRoutes);

// In the combined Render deployment, serve the built React app from the same origin
// as the API so the existing HTTP-only session cookie works reliably.
if (env.NODE_ENV === "production" && hasBuiltClient) {
  app.use(express.static(clientDistPath));

  app.use((req, res, next) => {
    if (
      req.method !== "GET" ||
      req.path === "/api" ||
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    return res.sendFile(clientIndexPath, (error) => {
      if (error) next(error);
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

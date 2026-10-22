import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireTrustedOriginForUnsafeMethods(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (!origin || origin !== env.CLIENT_ORIGIN) {
    return res.status(403).json({
      success: false,
      message: "Request origin not allowed"
    });
  }

  return next();
}

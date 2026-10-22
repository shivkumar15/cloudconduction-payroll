import { User } from "../models/User.js";
import {
  sessionCookieName,
  verifySessionToken
} from "../utils/sessionToken.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[sessionCookieName];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  try {
    const claims = verifySessionToken(token);
    if (typeof claims.sub !== "string" || !Number.isInteger(claims.ver)) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session"
      });
    }

    const user = await User.findById(claims.sub);
    if (!user || !user.isActive || user.tokenVersion !== claims.ver) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session"
      });
    }

    req.authUser = user;
    return next();
  } catch (error) {
    if (error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError" || error?.name === "NotBeforeError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session"
      });
    }
    return next(error);
  }
}

export function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.authUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action"
      });
    }

    return next();
  };
}

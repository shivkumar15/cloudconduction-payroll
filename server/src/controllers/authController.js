import { User } from "../models/User.js";
import { loginSchema } from "../validators/authSchemas.js";
import {
  sessionCookieName,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken
} from "../utils/sessionToken.js";

export async function login(req, res, next) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email and password"
    });
  }

  try {
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    const passwordMatches = user
      ? await user.comparePassword(parsed.data.password)
      : false;

    // Keep account-not-found, wrong-password, and disabled-account responses indistinguishable.
    if (!user || !passwordMatches || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = signSessionToken(user);
    res.cookie(sessionCookieName, token, sessionCookieOptions);

    return res.status(200).json({
      success: true,
      user: user.toPublicJSON()
    });
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies?.[sessionCookieName];
    if (token) {
      try {
        const claims = verifySessionToken(token);
        if (typeof claims.sub === "string") {
          // Incrementing the version invalidates previously issued sessions for this account.
          await User.updateOne(
            { _id: claims.sub },
            { $inc: { tokenVersion: 1 } }
          );
        }
      } catch (error) {
        // An invalid/expired cookie should still be cleared. Do not reveal token details.
        if (!["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(error?.name)) {
          throw error;
        }
      }
    }

    res.clearCookie(sessionCookieName, {
      httpOnly: sessionCookieOptions.httpOnly,
      secure: sessionCookieOptions.secure,
      sameSite: sessionCookieOptions.sameSite,
      path: sessionCookieOptions.path
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    return next(error);
  }
}

export function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    user: req.authUser.toPublicJSON()
  });
}

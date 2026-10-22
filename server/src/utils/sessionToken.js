import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const ISSUER = "cloudconduction-payroll";
const AUDIENCE = "cloudconduction-payroll-client";
const SESSION_TTL = "8h";

export function signSessionToken(user) {
  return jwt.sign(
    { ver: user.tokenVersion },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user._id.toString(),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: SESSION_TTL
    }
  );
}

export function verifySessionToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE
  });
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000
};

export const sessionCookieName = "ccp_session";

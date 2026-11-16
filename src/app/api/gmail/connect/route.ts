import { NextResponse } from "next/server";
import { route } from "@/lib/utils/api";
import { HttpError } from "@/lib/auth/session";
import { buildAuthUrl, isGmailOAuthConfigured, newState, STATE_COOKIE } from "@/lib/gmail/oauth";

/** Starts Gmail OAuth (separate from login). Sets a short-lived httpOnly CSRF state cookie and redirects to Google. */
export const GET = route(async (userId) => {
  if (!isGmailOAuthConfigured()) throw new HttpError(400, "Google OAuth is not configured (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)");
  const nonce = newState();
  const res = NextResponse.redirect(buildAuthUrl(`${nonce}.${userId}`));
  res.cookies.set(STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/gmail" });
  return res;
});

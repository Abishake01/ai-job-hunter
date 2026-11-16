import "server-only";
import { google } from "googleapis";
import { randomBytes } from "node:crypto";

/**
 * Gmail OAuth is SEPARATE from app login. Scopes:
 *  - gmail.readonly: targeted sync of job-related mail (metadata/snippet only is stored)
 *  - gmail.compose : create DRAFTS only
 *  - gmail.send    : used ONLY by the explicit per-email "approved + confirm:true" send action (email.service.sendOutreach)
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];
export const STATE_COOKIE = "gmail_oauth_state";

export function isGmailOAuthConfigured() { return !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET); }
export function redirectUri() { return `${(process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/gmail/callback`; }

export function createOAuthClient() {
  if (!isGmailOAuthConfigured()) throw new Error("Google OAuth is not configured (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)");
  return new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET, redirectUri());
}
export const newState = () => randomBytes(24).toString("base64url");

export function buildAuthUrl(state: string, loginHint?: string) {
  return createOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GMAIL_SCOPES, state, include_granted_scopes: false, login_hint: loginHint });
}

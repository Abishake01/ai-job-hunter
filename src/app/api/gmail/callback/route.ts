import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { requireUserId } from "@/lib/auth/session";
import { STATE_COOKIE } from "@/lib/gmail/oauth";
import { completeOAuth } from "@/lib/services/gmail.service";

const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/settings?tab=gmail&${q}`, process.env.AUTH_URL ?? req.url));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/gmail" });
  try {
    const userId = await requireUserId();
    if (url.searchParams.get("error")) return back(req, `gmail=error&reason=${encodeURIComponent(url.searchParams.get("error")!)}`);
    const state = url.searchParams.get("state") ?? "";
    const [nonce, uid] = state.split(".");
    const a = Buffer.from(nonce ?? ""), b = Buffer.from(cookie ?? "");
    if (!cookie || a.length !== b.length || !timingSafeEqual(a, b) || uid !== userId) return back(req, "gmail=error&reason=state_mismatch");
    const code = url.searchParams.get("code");
    if (!code) return back(req, "gmail=error&reason=missing_code");
    await completeOAuth(userId, code);
    return back(req, "gmail=connected");
  } catch (e) {
    console.error("[gmail callback]", e instanceof Error ? e.message : e);
    return back(req, `gmail=error&reason=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 120) : "failed")}`);
  }
}

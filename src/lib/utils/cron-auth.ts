import "server-only";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/auth/session";

/** Throws 401 unless `Authorization: Bearer <CRON_SECRET>` matches. Fails closed when CRON_SECRET is unset. */
export function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(401, "CRON_SECRET is not configured");
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Unauthorized");
}

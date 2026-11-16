import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError, requireUserId } from "@/lib/auth/session";

export function handleError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: e.issues }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
}

/** Wraps a route handler: authenticates, injects userId, maps errors to JSON. */
export function route<A extends unknown[]>(fn: (userId: string, req: Request, ...rest: A) => Promise<unknown>) {
  return async (req: Request, ...rest: A) => {
    try {
      const userId = await requireUserId();
      const out = await fn(userId, req, ...rest);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) { return handleError(e); }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw new HttpError(400, "Invalid JSON body"); }
  return schema.parse(json);
}
export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}
export { HttpError };

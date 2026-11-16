import "server-only";
import { auth } from "./index";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

/** Returns the authenticated app user id or throws 401. Every query must be scoped by this id. */
export async function requireUserId(): Promise<string> {
  const s = await auth();
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) throw new HttpError(401, "Unauthorized");
  return id;
}

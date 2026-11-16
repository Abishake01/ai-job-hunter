import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { addUnsubscribe, listUnsubscribes } from "@/lib/services/email.service";

export const GET = route(async (userId) => { const items = await listUnsubscribes(userId); return { items, total: items.length, page: 1, pageSize: items.length }; });
export const POST = route(async (userId, req) => { const b = await parseBody(req, z.object({ email: z.email(), reason: z.string().max(300).nullish() })); return { unsubscribe: await addUnsubscribe(userId, b.email, b.reason) }; });

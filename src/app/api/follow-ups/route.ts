import { z } from "zod";
import { route, parseBody, parseQuery } from "@/lib/utils/api";
import { listFollowUps, resolveFollowUp } from "@/lib/services/application.service";

export const GET = route(async (userId, req) => {
  const { status } = parseQuery(req, z.object({ status: z.enum(["pending", "done", "dismissed", "all"]).optional() }));
  const items = await listFollowUps(userId, status ?? "pending");
  return { items, total: items.length, page: 1, pageSize: items.length };
});
export const PATCH = route(async (userId, req) => {
  const b = await parseBody(req, z.object({ id: z.uuid(), status: z.enum(["done", "dismissed"]) }));
  return { followUp: await resolveFollowUp(userId, b.id, b.status) };
});

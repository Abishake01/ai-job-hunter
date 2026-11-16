import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { deleteAllData } from "@/lib/services/data.service";

/** POST { confirm: "DELETE", scope?: "data" | "account" } */
export const POST = route(async (userId, req) => {
  const b = await parseBody(req, z.object({ confirm: z.literal("DELETE"), scope: z.enum(["data", "account"]).default("data") }));
  return deleteAllData(userId, b.scope);
});

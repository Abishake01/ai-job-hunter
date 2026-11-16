import { z } from "zod";
import { route, parseQuery } from "@/lib/utils/api";
import { listApplications } from "@/lib/services/application.service";

const q = z.object({ status: z.string().optional(), q: z.string().optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional(), all: z.enum(["true", "false"]).optional() });
export const GET = route(async (userId, req) => { const f = parseQuery(req, q); return listApplications(userId, { ...f, all: f.all === "true" }); });

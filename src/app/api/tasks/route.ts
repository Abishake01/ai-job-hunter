import { z } from "zod";
import { route, parseQuery } from "@/lib/utils/api";
import { listTasks } from "@/lib/services/tasks.service";

const q = z.object({ status: z.string().optional(), type: z.string().optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });
export const GET = route(async (userId, req) => listTasks(userId, parseQuery(req, q)));

import { z } from "zod";
import { route, parseQuery } from "@/lib/utils/api";
import { listOutreach } from "@/lib/services/email.service";
import { EMAIL_STATUSES } from "@/lib/db/schema";

const q = z.object({ status: z.enum(EMAIL_STATUSES).optional(), jobId: z.uuid().optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });
export const GET = route(async (userId, req) => listOutreach(userId, parseQuery(req, q)));

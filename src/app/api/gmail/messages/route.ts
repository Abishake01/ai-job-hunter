import { z } from "zod";
import { route, parseQuery } from "@/lib/utils/api";
import { listMessages } from "@/lib/services/gmail.service";
import { EMAIL_CATEGORIES } from "@/lib/ai/heuristics/classify";

const q = z.object({ category: z.enum(EMAIL_CATEGORIES).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });
export const GET = route(async (userId, req) => listMessages(userId, parseQuery(req, q)));

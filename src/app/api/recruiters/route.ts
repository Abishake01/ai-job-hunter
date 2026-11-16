import { z } from "zod";
import { route, parseBody, parseQuery } from "@/lib/utils/api";
import { createRecruiterManual, listRecruiters } from "@/lib/services/recruiter.service";

const q = z.object({ q: z.string().optional(), companyId: z.uuid().optional(), jobId: z.uuid().optional(), verification: z.enum(["verified", "public", "inferred", "unknown"]).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() });
const body = z.object({
  companyId: z.uuid().optional(), companyName: z.string().min(1).max(200).optional(), jobId: z.uuid().nullish(),
  name: z.string().max(200).nullish(), designation: z.string().max(200).nullish(), email: z.email().nullish(), profileUrl: z.url().nullish(), sourceUrl: z.url().nullish(), notes: z.string().max(2000).nullish(),
});
export const GET = route(async (userId, req) => listRecruiters(userId, parseQuery(req, q)));
export const POST = route(async (userId, req) => ({ recruiter: await createRecruiterManual(userId, await parseBody(req, body)) }));

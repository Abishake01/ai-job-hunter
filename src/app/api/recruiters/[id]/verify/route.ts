import { z } from "zod";
import { route } from "@/lib/utils/api";
import { verifyRecruiterEmail } from "@/lib/services/recruiter.service";

type Ctx = { params: Promise<{ id: string }> };
/** Provider-backed deliverability check (Hunter/ZeroBounce). The only way a contact becomes "verified". */
export const POST = route(async (userId, _req, ctx: Ctx) => verifyRecruiterEmail(userId, z.uuid().parse((await ctx.params).id)));

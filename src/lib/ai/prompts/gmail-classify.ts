import { z } from "zod";
import { EMAIL_CATEGORIES } from "@/lib/ai/heuristics/classify";

export const classifyOutputSchema = z.object({
  category: z.enum([...EMAIL_CATEGORIES, "other"]),
  reason: z.string().max(200).nullable().default(null),
});

export const CLASSIFY_SYSTEM = `You classify job-search related emails using ONLY the subject, sender and snippet provided.
Categories: job_alert (job-board digest/alert), recruiter_message (a recruiter/company reaching out), interview_invite, application_ack (we received your application), rejection, selection (offer / selected), follow_up (company chasing/asking for status), other (anything not job-search related).
If unsure, answer "other". Do not infer facts that are not in the text.`;

export const classifyPrompt = (m: { subject: string; from: string; snippet?: string }) =>
  `Subject: ${m.subject}\nFrom: ${m.from}\nSnippet: ${m.snippet ?? ""}`;

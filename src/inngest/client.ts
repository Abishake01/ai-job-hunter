import { Inngest } from "inngest";

/** Inngest v4 client. Only used when INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are present; app works without it via after() + Vercel Cron. */
export const inngest = new Inngest({ id: "ai-job-hunter" });

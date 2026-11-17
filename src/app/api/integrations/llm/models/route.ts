import { route } from "@/lib/utils/api";
import { listModels } from "@/lib/ai/llm";

/** GET → chat models available to the user's saved key (never returns the key). */
export const GET = route(async (userId) => ({ models: await listModels(userId) }));

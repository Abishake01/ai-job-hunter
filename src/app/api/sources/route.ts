import { route } from "@/lib/utils/api";
import { listSources } from "@/lib/services/discovery.service";

export const GET = route(async (userId) => ({ items: await listSources(userId) }));

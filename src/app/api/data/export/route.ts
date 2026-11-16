import { route } from "@/lib/utils/api";
import { exportAllData } from "@/lib/services/data.service";

export const GET = route(async (userId) => {
  const data = await exportAllData(userId);
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="ai-job-hunter-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "private, no-store" } });
});

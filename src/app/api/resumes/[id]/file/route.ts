import { route } from "@/lib/utils/api";
import { getResumeFile } from "@/lib/services/resume.service";

/** Streams the stored PDF inline (add ?download=1 to force download). */
export const GET = route(async (userId, req, ctx: { params: Promise<{ id: string }> }) => {
  const f = await getResumeFile(userId, (await ctx.params).id);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const safe = f.filename.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(f.fileData), { headers: { "content-type": f.mimeType, "content-disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});

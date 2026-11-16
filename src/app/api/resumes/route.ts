import { route, HttpError } from "@/lib/utils/api";
import { createResume, listResumes } from "@/lib/services/resume.service";
import { MAX_RESUME_BYTES } from "@/lib/resume/pdf";

export const GET = route(async (userId) => ({ items: await listResumes(userId) }));

/** multipart/form-data: file (PDF, ≤5MB), name?, makeDefault? */
export const POST = route(async (userId, req) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_RESUME_BYTES + 100_000) throw new HttpError(413, "File is larger than the 5MB limit.");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new HttpError(400, "Expected multipart/form-data with a PDF file"); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");
  if (file.size > MAX_RESUME_BYTES) throw new HttpError(413, "File is larger than the 5MB limit.");
  const data = Buffer.from(await file.arrayBuffer());
  const name = form.get("name");
  const rec = await createResume(userId, { name: typeof name === "string" ? name : undefined, filename: file.name || "resume.pdf", data, makeDefault: form.get("makeDefault") === "true" });
  return Response.json(rec, { status: 201 });
});

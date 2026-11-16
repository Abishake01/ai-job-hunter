import { z } from "zod";
import { route, parseBody } from "@/lib/utils/api";
import { addNote, setNotes } from "@/lib/services/application.service";

type Ctx = { params: Promise<{ id: string }> };
/** POST {note} appends a timestamped note; PUT {notes} replaces the notes field. */
export const POST = route(async (userId, req, ctx: Ctx) => addNote(userId, (await ctx.params).id, (await parseBody(req, z.object({ note: z.string().min(1).max(5000) }))).note));
export const PUT = route(async (userId, req, ctx: Ctx) => setNotes(userId, (await ctx.params).id, (await parseBody(req, z.object({ notes: z.string().max(10000) }))).notes));

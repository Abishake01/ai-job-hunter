import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, candidateProfiles, skills, candidateSkills } from "@/lib/db/schema";
import { DEFAULT_PROFILE, DEFAULT_PRIMARY_SKILLS, DEFAULT_ADDITIONAL_SKILLS } from "@/lib/services/profile.service";
import { defaultSettings } from "@/lib/validation/settings";
import { normalizeSkill } from "@/lib/utils/skills";

/** Upserts the user and seeds a candidate profile (config only — never any jobs). */
export async function ensureUser(i: { email: string; name: string | null; image: string | null; googleSub: string | null }) {
  const email = i.email.toLowerCase();
  let [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) {
    [u] = await db.insert(users).values({ email, name: i.name, image: i.image, googleSub: i.googleSub }).returning();
    await db.insert(candidateProfiles).values({ userId: u.id, fullName: i.name, ...DEFAULT_PROFILE, settings: defaultSettings() });
    for (const [list, level] of [[DEFAULT_PRIMARY_SKILLS, "primary"], [DEFAULT_ADDITIONAL_SKILLS, "additional"]] as const) {
      for (const name of list) {
        const n = normalizeSkill(name);
        const [s] = await db.insert(skills).values({ name, normalized: n }).onConflictDoUpdate({ target: skills.normalized, set: { name } }).returning();
        await db.insert(candidateSkills).values({ userId: u.id, skillId: s.id, level }).onConflictDoNothing();
      }
    }
  } else if (i.googleSub && !u.googleSub) {
    await db.update(users).set({ googleSub: i.googleSub }).where(eq(users.id, u.id));
  }
  return u;
}

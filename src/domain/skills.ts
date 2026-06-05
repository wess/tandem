import { db, from, insertRow, iso, skills } from "../db/index.ts";
import type { SkillRow } from "../db/schema.ts";
import type { Skill } from "../shared/types.ts";

export const toSkill = (r: SkillRow): Skill => ({
  id: r.id,
  name: r.name,
  description: r.description,
  steps: r.steps,
  authorId: r.author_id,
  useCount: r.use_count,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const listSkills = async (): Promise<Skill[]> =>
  (await db.all<SkillRow>(from(skills).orderBy("name", "ASC"))).map(toSkill);

// Case-insensitive lookup on the full name (no lossy slug).
const getByName = async (name: string): Promise<SkillRow | undefined> =>
  (await db.all<SkillRow>({ text: "SELECT * FROM skills WHERE lower(name) = lower($1) LIMIT 1", values: [name] }))[0];

export type NewSkill = { name: string; description?: string; steps: string; authorId?: number | null };

export const saveSkill = async (input: NewSkill): Promise<SkillRow> => {
  const name = input.name.trim().slice(0, 60) || "skill";
  const existing = await getByName(name);
  if (existing) {
    await db.execute(
      from(skills).where((q) => q("id").equals(existing.id)).update({
        description: input.description ?? existing.description,
        steps: input.steps,
        updated_at: new Date(),
      }),
    );
    return (await db.one<SkillRow>(from(skills).where((q) => q("id").equals(existing.id)))) ?? existing;
  }
  return insertRow(skills, { name, description: input.description ?? "", steps: input.steps, author_id: input.authorId ?? null });
};

export const removeSkill = (id: number): Promise<unknown> =>
  db.execute(from(skills).where((q) => q("id").equals(id)).del());

const cap = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export const skillsDigest = async (limit = 20): Promise<string> => {
  const rows = (await db.all<SkillRow>(from(skills).orderBy("name", "ASC"))).slice(0, limit);
  if (rows.length === 0) return "";
  return rows
    .map(
      (s) =>
        `- ${s.name}${s.description ? ` — ${s.description}` : ""}${s.steps ? `\n    ${cap(s.steps.replace(/\n+/g, " "), 300)}` : ""}`,
    )
    .join("\n");
};

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

export const listSkills = async (ownerId: number): Promise<Skill[]> =>
  (await db.all<SkillRow>(from(skills).where((q) => q("owner_id").equals(ownerId)).orderBy("name", "ASC"))).map(toSkill);

// Case-insensitive lookup on the full name (no lossy slug), scoped to the owner.
const getByName = async (ownerId: number, name: string): Promise<SkillRow | undefined> =>
  (
    await db.all<SkillRow>({
      text: "SELECT * FROM skills WHERE owner_id = $1 AND lower(name) = lower($2) LIMIT 1",
      values: [ownerId, name],
    })
  )[0];

export type NewSkill = { ownerId: number; name: string; description?: string; steps: string; authorId?: number | null };

export const saveSkill = async (input: NewSkill): Promise<SkillRow> => {
  const name = input.name.trim().slice(0, 60) || "skill";
  const existing = await getByName(input.ownerId, name);
  if (existing) {
    await db.execute(
      from(skills).where((q) => q("owner_id").equals(input.ownerId)).where((q) => q("id").equals(existing.id)).update({
        description: input.description ?? existing.description,
        steps: input.steps,
        updated_at: new Date(),
      }),
    );
    return (
      (await db.one<SkillRow>(
        from(skills).where((q) => q("owner_id").equals(input.ownerId)).where((q) => q("id").equals(existing.id)),
      )) ?? existing
    );
  }
  return insertRow(skills, {
    owner_id: input.ownerId,
    name,
    description: input.description ?? "",
    steps: input.steps,
    author_id: input.authorId ?? null,
  });
};

export const removeSkill = (ownerId: number, id: number): Promise<unknown> =>
  db.execute(from(skills).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)).del());

const cap = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export const skillsDigest = async (ownerId: number, limit = 20): Promise<string> => {
  const rows = (await db.all<SkillRow>(from(skills).where((q) => q("owner_id").equals(ownerId)).orderBy("name", "ASC"))).slice(
    0,
    limit,
  );
  if (rows.length === 0) return "";
  return rows
    .map(
      (s) =>
        `- ${s.name}${s.description ? ` — ${s.description}` : ""}${s.steps ? `\n    ${cap(s.steps.replace(/\n+/g, " "), 300)}` : ""}`,
    )
    .join("\n");
};

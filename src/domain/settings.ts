import { db, from, settings } from "../db/index.ts";

export const getSetting = async (ownerId: number, key: string): Promise<string | undefined> => {
  const row = await db.one<{ value: string }>(
    from(settings).where((q) => q("owner_id").equals(ownerId)).where((q) => q("key").equals(key)).select("value"),
  );
  return row?.value || undefined;
};

export const setSetting = async (ownerId: number, key: string, value: string): Promise<void> => {
  const exists = await db.one(
    from(settings).where((q) => q("owner_id").equals(ownerId)).where((q) => q("key").equals(key)),
  );
  if (exists)
    await db.execute(
      from(settings).where((q) => q("owner_id").equals(ownerId)).where((q) => q("key").equals(key)).update({ value }),
    );
  else await db.execute(from(settings).insert({ owner_id: ownerId, key, value }));
};

import { db, from, insertRow, iso, num, numN, schedules } from "../db/index.ts";
import type { ScheduleRow } from "../db/schema.ts";
import type { Schedule } from "../shared/types.ts";

const MIN_MS = 60_000;

export const toSchedule = (r: ScheduleRow): Schedule => ({
  id: r.id,
  channelId: r.channel_id,
  agentId: r.agent_id,
  prompt: r.prompt,
  intervalMinutes: r.interval_minutes,
  nextRunAt: num(r.next_run_at),
  lastRunAt: numN(r.last_run_at),
  enabled: Boolean(r.enabled),
  createdAt: iso(r.created_at),
});

export const listSchedules = async (ownerId: number, channelId: number): Promise<Schedule[]> =>
  (
    await db.all<ScheduleRow>(
      from(schedules)
        .where((q) => q("owner_id").equals(ownerId))
        .where((q) => q("channel_id").equals(channelId))
        .orderBy("id", "ASC"),
    )
  ).map(toSchedule);

export const getSchedule = (ownerId: number, id: number): Promise<ScheduleRow | null> =>
  db.one(from(schedules).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)));

export type NewSchedule = { channelId: number; agentId: number; prompt: string; intervalMinutes: number };

export const createSchedule = (ownerId: number, input: NewSchedule, now: number): Promise<ScheduleRow> =>
  insertRow(schedules, {
    owner_id: ownerId,
    channel_id: input.channelId,
    agent_id: input.agentId,
    prompt: input.prompt,
    interval_minutes: input.intervalMinutes,
    next_run_at: now + input.intervalMinutes * MIN_MS,
  });

export const updateSchedule = async (
  ownerId: number,
  id: number,
  patch: { enabled?: boolean; prompt?: string; intervalMinutes?: number },
  now: number,
): Promise<ScheduleRow | null> => {
  const clean: Record<string, unknown> = {};
  if (patch.enabled !== undefined) clean.enabled = patch.enabled;
  if (patch.prompt !== undefined) clean.prompt = patch.prompt;
  if (patch.intervalMinutes !== undefined) {
    clean.interval_minutes = patch.intervalMinutes;
    clean.next_run_at = now + patch.intervalMinutes * MIN_MS;
  }
  if (Object.keys(clean).length)
    await db.execute(from(schedules).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)).update(clean));
  return getSchedule(ownerId, id);
};

export const removeSchedule = (ownerId: number, id: number): Promise<unknown> =>
  db.execute(from(schedules).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)).del());
export const removeSchedulesForAgent = (ownerId: number, agentId: number): Promise<unknown> =>
  db.execute(from(schedules).where((q) => q("owner_id").equals(ownerId)).where((q) => q("agent_id").equals(agentId)).del());
export const removeSchedulesForChannel = (ownerId: number, channelId: number): Promise<unknown> =>
  db.execute(from(schedules).where((q) => q("owner_id").equals(ownerId)).where((q) => q("channel_id").equals(channelId)).del());

// Global across all users — the scheduler fans these out per owner. Returns
// rows (with owner_id) so the scheduler can scope each run to its tenant.
export const dueSchedules = (now: number): Promise<ScheduleRow[]> =>
  db.all<ScheduleRow>({
    text: "SELECT * FROM schedules WHERE enabled = true AND next_run_at <= $1 ORDER BY next_run_at ASC",
    values: [now],
  });

export const markRan = (ownerId: number, id: number, intervalMinutes: number, now: number): Promise<unknown> =>
  db.execute(
    from(schedules)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("id").equals(id))
      .update({ last_run_at: now, next_run_at: now + intervalMinutes * MIN_MS }),
  );

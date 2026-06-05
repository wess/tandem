import type { ChannelRow } from "../../db/schema.ts";
import type { Agent } from "../../shared/types.ts";
import { getAgentById } from "../agents.ts";
import { getChannel, listMembers } from "../channels.ts";
import { broadcast } from "../events.ts";
import { insertMessage, toMessage } from "../messages.ts";
import { dueSchedules, markRan, updateSchedule } from "../schedules.ts";
import { dispatch, startCascade } from "./index.ts";

const TICK_MS = 30_000;
let timer: ReturnType<typeof setInterval> | undefined;

const fire = async (channel: ChannelRow, agent: Agent, prompt: string): Promise<void> => {
  // Post the scheduled prompt as a human turn targeting the agent, then run it
  // through the normal pipeline (head orchestration etc. still apply).
  const content = prompt.includes(`@${agent.handle}`) ? prompt : `@${agent.handle} ${prompt}`;
  const msg = await insertMessage({ channelId: channel.id, authorType: "human", content });
  broadcast("message:created", toMessage(msg));
  await dispatch(msg, startCascade(channel.id));
};

// Sequential so a backlog at startup doesn't fire a thundering herd of cascades.
export const tick = async (): Promise<void> => {
  const now = Date.now();
  for (const s of await dueSchedules(now)) {
    const channel = await getChannel(s.channelId);
    const agent = await getAgentById(s.agentId);
    // Orphaned (channel/agent gone or no longer a member): disable so it stops
    // re-arming instead of silently no-op-ing every interval.
    if (!channel || !agent || !(await listMembers(channel.id)).some((m) => m.id === agent.id)) {
      await updateSchedule(s.id, { enabled: false }, now);
      continue;
    }
    await markRan(s.id, s.intervalMinutes, now); // advance first so a slow run can't double-fire
    try {
      await fire(channel, agent, s.prompt);
    } catch {
      // a single failed run must not break the tick loop
    }
  }
};

export const startScheduler = (): void => {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_MS);
  void tick(); // catch overdue at launch
};

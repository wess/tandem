import { selectChannel } from "../state/actions.ts";
import { getState, patchChannelMessages, setState } from "../state/store.ts";
import { on } from "../transport.ts";

const loaded = (channelId: number): boolean => getState().messagesByChannel[channelId] !== undefined;

// Wire WebSocket broadcasts into the store. Called once, after auth, on boot.
export const initEvents = (): void => {
  on("message:created", (msg) => {
    if (loaded(msg.channelId))
      patchChannelMessages(msg.channelId, (m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
  });

  on("message:delta", ({ id, channelId, delta }) => {
    if (!loaded(channelId)) return;
    patchChannelMessages(channelId, (m) => m.map((x) => (x.id === id ? { ...x, content: x.content + delta } : x)));
  });

  on("message:updated", (msg) => {
    if (loaded(msg.channelId)) patchChannelMessages(msg.channelId, (m) => m.map((x) => (x.id === msg.id ? msg : x)));
  });

  on("message:removed", ({ id, channelId }) => {
    if (loaded(channelId)) patchChannelMessages(channelId, (m) => m.filter((x) => x.id !== id));
  });

  on("channel:created", (ch) => {
    setState((s) => (s.channels.some((c) => c.id === ch.id) ? s : { ...s, channels: [...s.channels, ch] }));
  });

  on("channel:updated", (ch) => {
    setState((s) => ({ ...s, channels: s.channels.map((c) => (c.id === ch.id ? ch : c)) }));
  });

  on("channel:deleted", ({ id }) => {
    const wasActive = getState().activeChannelId === id;
    setState((s) => {
      const channels = s.channels.filter((c) => c.id !== id);
      const messagesByChannel = { ...s.messagesByChannel };
      const membersByChannel = { ...s.membersByChannel };
      const typingByChannel = { ...s.typingByChannel };
      delete messagesByChannel[id];
      delete membersByChannel[id];
      delete typingByChannel[id];
      return { ...s, channels, messagesByChannel, membersByChannel, typingByChannel };
    });
    if (wasActive) {
      const next = getState();
      const fallback = next.channels.find((c) => c.slug === "general") ?? next.channels[0];
      if (fallback) void selectChannel(fallback.id);
      else setState({ activeChannelId: null });
    }
  });

  on("agent:created", (a) => {
    setState((s) => (s.agents.some((x) => x.id === a.id) ? s : { ...s, agents: [...s.agents, a] }));
  });

  on("agent:updated", (a) => {
    setState((s) => {
      const membersByChannel: Record<number, typeof s.agents> = {};
      for (const key of Object.keys(s.membersByChannel)) {
        const cid = Number(key);
        const arr = s.membersByChannel[cid];
        // Only rebuild arrays that actually contain the agent — leave the rest
        // referentially stable so unrelated channels don't re-render.
        membersByChannel[cid] = arr.some((m) => m.id === a.id) ? arr.map((m) => (m.id === a.id ? a : m)) : arr;
      }
      return { ...s, agents: s.agents.map((x) => (x.id === a.id ? a : x)), membersByChannel };
    });
  });

  on("agent:deleted", ({ id }) => {
    setState((s) => {
      const membersByChannel: Record<number, typeof s.agents> = {};
      for (const key of Object.keys(s.membersByChannel)) {
        const cid = Number(key);
        membersByChannel[cid] = s.membersByChannel[cid].filter((a) => a.id !== id);
      }
      return { ...s, agents: s.agents.filter((a) => a.id !== id), membersByChannel };
    });
  });

  on("members:changed", ({ channelId, members }) => {
    setState((s) => ({ ...s, membersByChannel: { ...s.membersByChannel, [channelId]: members } }));
  });

  on("providers:changed", ({ providers }) => setState({ providers }));

  on("agent:typing", ({ channelId, agentId, active }) => {
    setState((s) => {
      const cur = s.typingByChannel[channelId] ?? [];
      const next = active ? (cur.includes(agentId) ? cur : [...cur, agentId]) : cur.filter((x) => x !== agentId);
      return { ...s, typingByChannel: { ...s.typingByChannel, [channelId]: next } };
    });
  });

  // M1.5 — a server-side goal in an agentless channel produced a team proposal.
  // Park it on the channel so a prompt can render. accept/dismiss live in
  // state/actions.ts (acceptTeamSuggestion / dismissTeamSuggestion); the accept
  // prompt renders off this in components/channel/teamsuggestion.tsx.
  on("team:suggested", (payload) => {
    setState((s) => ({
      ...s,
      teamSuggestionByChannel: { ...s.teamSuggestionByChannel, [payload.channelId]: payload },
    }));
  });

  // M5.1 — the channel↔artifact link changed (project:set). Park it by channel so
  // a project panel can render the live repo/deploy state off projectByChannel.
  on("project:updated", (project) => {
    setState((s) => ({
      ...s,
      projectByChannel: { ...s.projectByChannel, [project.channelId]: project },
    }));
  });

  // Task #15 — a destructive MCP tool call was parked pending human approval.
  // Park it by channel + approvalId so the channel view renders an approve/deny
  // prompt (components/channel/approval.tsx); resolveApproval (state/actions.ts)
  // clears it and calls the RPC. The server also posts a system message, so the
  // transcript reflects the request alongside the prompt.
  on("approval:requested", (req) => {
    setState((s) => {
      const forChannel = s.approvalsByChannel[req.channelId] ?? {};
      return {
        ...s,
        approvalsByChannel: {
          ...s.approvalsByChannel,
          [req.channelId]: { ...forChannel, [req.approvalId]: req },
        },
      };
    });
  });
};

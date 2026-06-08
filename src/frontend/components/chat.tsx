import { closeMembers, deleteAgent, openModal, toggleMembers, toggleSidebar } from "../state/actions.ts";
import { useStore } from "../state/store.ts";
import { Avatar } from "./agent/avatar.tsx";
import { ApprovalPrompts } from "./channel/approval.tsx";
import { ProjectPanel } from "./channel/project.tsx";
import { TeamSuggestionCard } from "./channel/teamsuggestion.tsx";
import { Composer } from "./composer.tsx";
import { Icon } from "./icon.tsx";
import { Members } from "./members.tsx";
import { MessageList } from "./message/list.tsx";

const Welcome = () => (
  <div className="welcome">
    <div className="welcomemark">◐</div>
    <h2>Welcome to Tandem</h2>
    <p>You're the only human here. Add an AI agent — Claude, GPT, a local Llama — and start talking.</p>
    <button type="button" className="primary" onClick={() => openModal({ kind: "addAgent" })}>
      <Icon name="plus" size={16} /> Add your first agent
    </button>
  </div>
);

export const Chat = () => {
  const channelId = useStore((s) => s.activeChannelId);
  const channel = useStore((s) => s.channels.find((c) => c.id === channelId));
  const dmAgent = useStore((s) =>
    channel?.kind === "dm" ? s.agents.find((a) => a.id === channel.agentId) : undefined,
  );
  const ready = useStore((s) => s.ready);
  const membersOpen = useStore((s) => s.membersOpen);

  if (!ready) {
    return (
      <main className="chat">
        <div className="boot">Loading Tandem…</div>
      </main>
    );
  }

  if (!channel || channelId == null) {
    return (
      <main className="chat">
        <Welcome />
      </main>
    );
  }

  const showMembers = channel.kind !== "dm";

  return (
    <main className="chat">
      <header className="chathead">
        <button type="button" className="iconbtn menubtn" title="Menu" onClick={toggleSidebar}>
          <Icon name="menu" size={18} />
        </button>
        <div className="chattitle">
          {channel.kind === "dm" ? (
            dmAgent && <Avatar agent={dmAgent} size={24} />
          ) : (
            <span className="headhash">
              <Icon name="hash" size={18} />
            </span>
          )}
          <h1>{channel.kind === "dm" ? (dmAgent?.name ?? channel.name) : channel.slug}</h1>
          {channel.topic && <span className="chattopic">{channel.topic}</span>}
        </div>
        <ProjectPanel channelId={channelId} />
        <div className="headactions">
          {showMembers && (
            <button type="button" className="iconbtn membersbtn" title="Members" onClick={toggleMembers}>
              <Icon name="users" size={16} />
            </button>
          )}
          <button
            type="button"
            className="iconbtn"
            title="Scheduled tasks"
            onClick={() => openModal({ kind: "schedules", channelId })}
          >
            <Icon name="clock" size={16} />
          </button>
          <button
            type="button"
            className="iconbtn"
            title="Collective memory"
            onClick={() => openModal({ kind: "memory", channelId })}
          >
            <Icon name="memory" size={16} />
          </button>
          {channel.kind === "dm" && dmAgent && (
            <button
              type="button"
              className="iconbtn"
              title={`Remove ${dmAgent.name}`}
              onClick={() => void deleteAgent(dmAgent.id)}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="chatbody">
        <div className="threadcol">
          <MessageList channelId={channelId} />
          <TeamSuggestionCard channelId={channelId} />
          <ApprovalPrompts channelId={channelId} />
          <Composer />
        </div>
        {showMembers && <Members channelId={channelId} open={membersOpen} />}
      </div>
      {showMembers && membersOpen && (
        <button type="button" className="scrim" aria-label="Close members" onClick={closeMembers} />
      )}
    </main>
  );
};

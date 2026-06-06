import type { Agent } from "../../shared/types.ts";
import { openModal, removeMember, setHead } from "../state/actions.ts";
import { useStore } from "../state/store.ts";
import { Avatar } from "./agent/avatar.tsx";
import { Icon } from "./icon.tsx";

const providerLabel = (a: Agent): string => `${a.providerKind} · ${a.model}`;

export const Members = ({ channelId, open = false }: { channelId: number; open?: boolean }) => {
  const members = useStore((s) => s.membersByChannel[channelId]) ?? [];
  const typing = useStore((s) => s.typingByChannel[channelId]) ?? [];
  const channel = useStore((s) => s.channels.find((c) => c.id === channelId));
  const headId = channel?.headAgentId ?? null;
  const nameOf = (id: number | null): string | undefined => members.find((m) => m.id === id)?.name;

  return (
    <aside className={`members${open ? " open" : ""}`}>
      <div className="memshead">
        <span>Members</span>
        <span className="count">{members.length}</span>
      </div>
      <button type="button" className="invitebtn" onClick={() => openModal({ kind: "invite", channelId })}>
        <Icon name="plus" size={14} /> Invite agents
      </button>
      <div className="memlist">
        {members.map((m) => {
          const isHead = m.id === headId;
          const parentName = m.parentId != null ? nameOf(m.parentId) : undefined;
          return (
            <div className={`memrow${isHead ? " ishead" : ""}`} key={m.id}>
              <Avatar agent={m} size={32} />
              <div className="memmeta">
                <span className="memname">
                  {m.name}
                  {isHead && (
                    <span className="crownbadge" title="Head agent">
                      <Icon name="crown" size={12} />
                    </span>
                  )}
                  {typing.includes(m.id) && <span className="typedot" />}
                </span>
                <span className="memsub">{parentName ? `subagent · ${parentName}` : providerLabel(m)}</span>
              </div>
              <button
                type="button"
                className={`memact${isHead ? " on" : ""}`}
                title={isHead ? "Remove as head" : "Make head agent"}
                onClick={() => void setHead(channelId, isHead ? null : m.id)}
              >
                <Icon name="crown" size={13} />
              </button>
              <button
                type="button"
                className="memx"
                title="Remove from channel"
                onClick={() => void removeMember(channelId, m.id)}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
        {members.length === 0 && <div className="memempty">No agents here yet. Invite one so messages get a reply.</div>}
      </div>
    </aside>
  );
};

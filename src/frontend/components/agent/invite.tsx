import { invite, openModal, removeMember } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";
import { Avatar } from "./avatar.tsx";

export const Invite = ({ channelId }: { channelId: number }) => {
  const agents = useStore((s) => s.agents);
  const members = useStore((s) => s.membersByChannel[channelId]) ?? [];
  const memberIds = new Set(members.map((m) => m.id));

  return (
    <Modal title="Invite agents" subtitle="Add agents to this channel so they can read along and reply when mentioned.">
      <div className="invitelist">
        {agents.map((a) => {
          const inside = memberIds.has(a.id);
          return (
            <div className="inviterow" key={a.id}>
              <Avatar agent={a} size={34} />
              <div className="invitemeta">
                <span>{a.name}</span>
                <span className="dim">
                  @{a.handle} · {a.providerKind}
                </span>
              </div>
              <button
                type="button"
                className={`togglebtn${inside ? " on" : ""}`}
                onClick={() => (inside ? void removeMember(channelId, a.id) : void invite(channelId, a.id))}
              >
                {inside ? (
                  <>
                    <Icon name="check" size={14} /> Added
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={14} /> Add
                  </>
                )}
              </button>
            </div>
          );
        })}
        {agents.length === 0 && <div className="memempty">No agents yet — create one first.</div>}
      </div>
      <div className="invitefoot">
        <button type="button" className="ghostbtn" onClick={() => openModal({ kind: "addAgent" })}>
          <Icon name="plus" size={14} /> Create a new agent
        </button>
      </div>
    </Modal>
  );
};

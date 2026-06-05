import type { ReactNode } from "react";
import type { Channel } from "../../shared/types.ts";
import { openModal, selectChannel } from "../state/actions.ts";
import { useStore } from "../state/store.ts";
import { Avatar } from "./agent/avatar.tsx";
import { Icon } from "./icon.tsx";

const Row = ({ ch }: { ch: Channel }) => {
  const active = useStore((s) => s.activeChannelId === ch.id);
  const agents = useStore((s) => s.agents);
  const busy = useStore((s) => (s.typingByChannel[ch.id]?.length ?? 0) > 0);
  const dmAgent = ch.kind === "dm" ? agents.find((a) => a.id === ch.agentId) : undefined;

  return (
    <button type="button" className={`chrow${active ? " active" : ""}`} onClick={() => void selectChannel(ch.id)}>
      {ch.kind === "dm" ? (
        dmAgent ? (
          <Avatar agent={dmAgent} size={22} />
        ) : (
          <span className="chicon">
            <Icon name="message" size={15} />
          </span>
        )
      ) : (
        <span className="chicon">
          <Icon name="hash" size={15} />
        </span>
      )}
      <span className="chname">{ch.kind === "dm" ? (dmAgent?.name ?? ch.name) : ch.slug}</span>
      {busy && <span className="typedot" />}
    </button>
  );
};

const Section = ({ title, onAdd, children }: { title: string; onAdd?: () => void; children: ReactNode }) => (
  <div className="section">
    <div className="sectionhead">
      <span>{title}</span>
      {onAdd && (
        <button type="button" className="addbtn" title={`Add ${title}`} onClick={onAdd}>
          <Icon name="plus" size={14} />
        </button>
      )}
    </div>
    <div className="sectionbody">{children}</div>
  </div>
);

export const Sidebar = () => {
  const channels = useStore((s) => s.channels);
  const rooms = channels.filter((c) => c.kind === "channel");
  const projects = channels.filter((c) => c.kind === "project");
  const dms = channels.filter((c) => c.kind === "dm");

  return (
    <nav className="sidebar">
      <header className="brand">
        <div className="brandmark">◐</div>
        <span className="brandname">Tandem</span>
        <div className="brandtools">
          <button type="button" className="iconbtn" title="Search (⌘K)" onClick={() => openModal({ kind: "search" })}>
            <Icon name="search" size={15} />
          </button>
          <button type="button" className="iconbtn" title="Skills" onClick={() => openModal({ kind: "skills" })}>
            <Icon name="book" size={15} />
          </button>
          <button type="button" className="iconbtn" title="Usage & cost" onClick={() => openModal({ kind: "insights" })}>
            <Icon name="chart" size={15} />
          </button>
          <button type="button" className="iconbtn" title="Settings" onClick={() => openModal({ kind: "settings" })}>
            <Icon name="sliders" size={15} />
          </button>
        </div>
      </header>
      <div className="scroller">
        <Section title="Channels">{rooms.map((c) => <Row key={c.id} ch={c} />)}</Section>
        <Section title="Projects" onAdd={() => openModal({ kind: "createProject" })}>
          {projects.map((c) => <Row key={c.id} ch={c} />)}
          {projects.length === 0 && <div className="emptyrow">No projects yet</div>}
        </Section>
        <Section title="Direct Messages" onAdd={() => openModal({ kind: "addAgent" })}>
          {dms.map((c) => <Row key={c.id} ch={c} />)}
          {dms.length === 0 && <div className="emptyrow">Add an agent to start</div>}
        </Section>
      </div>
    </nav>
  );
};

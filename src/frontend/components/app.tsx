import { useEffect } from "react";
import { openModal } from "../state/actions.ts";
import { getState, type Modal as ModalState, useStore } from "../state/store.ts";
import { AddAgent } from "./agent/add.tsx";
import { Invite } from "./agent/invite.tsx";
import { CreateProject } from "./channel/create.tsx";
import { Chat } from "./chat.tsx";
import { InsightsPanel } from "./insights/panel.tsx";
import { MemoryPanel } from "./memory/panel.tsx";
import { SchedulePanel } from "./schedule/panel.tsx";
import { SearchPalette } from "./search/palette.tsx";
import { Settings } from "./settings/index.tsx";
import { Sidebar } from "./sidebar.tsx";
import { SkillsPanel } from "./skills/panel.tsx";

const ModalHost = ({ modal }: { modal: ModalState }) => {
  switch (modal.kind) {
    case "addAgent":
      return <AddAgent />;
    case "createProject":
      return <CreateProject />;
    case "settings":
      return <Settings />;
    case "invite":
      return <Invite channelId={modal.channelId} />;
    case "memory":
      return <MemoryPanel channelId={modal.channelId} />;
    case "search":
      return <SearchPalette />;
    case "skills":
      return <SkillsPanel />;
    case "schedules":
      return <SchedulePanel channelId={modal.channelId} />;
    case "insights":
      return <InsightsPanel />;
  }
};

export const App = () => {
  const modal = useStore((s) => s.modal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (getState().modal) return; // don't clobber an open modal's form input
        e.preventDefault();
        openModal({ kind: "search" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <Chat />
      {modal && <ModalHost modal={modal} />}
    </div>
  );
};

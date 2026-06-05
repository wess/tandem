import { useCallback, useEffect, useState } from "react";
import type { Memory } from "../../../shared/types.ts";
import { compressChannel, deleteMemory, pinMemory } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { invoke, on } from "../../transport.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";

export const MemoryPanel = ({ channelId }: { channelId: number }) => {
  const agents = useStore((s) => s.agents);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const refresh = useCallback(() => {
    void invoke("memories:list", { channelId }).then(setMemories);
  }, [channelId]);

  useEffect(() => {
    refresh();
    const subs = [on("memory:added", refresh), on("memory:removed", refresh), on("memory:updated", refresh)];
    return () => {
      for (const u of subs) u();
    };
  }, [refresh]);

  const nameOf = (id: number | null): string => agents.find((a) => a.id === id)?.name ?? "—";
  const global = memories.filter((m) => m.scope === "global");
  const local = memories.filter((m) => m.scope === "channel");

  const compress = async () => {
    setBusy(true);
    setStatus("");
    try {
      const r = await compressChannel(channelId);
      setStatus(r.ok ? "Compressed older history into a pinned memory." : "Nothing old enough to compress yet.");
    } finally {
      setBusy(false);
    }
  };

  const Item = ({ m }: { m: Memory }) => (
    <div className="memoryrow">
      <div className="memorymeta">
        <span className="memorytitle">
          {m.title}
          {m.pinned && <span className="chip">pinned</span>}
        </span>
        {m.body && <span className="memorybody">{m.body}</span>}
        <span className="memoryby">
          recorded by {nameOf(m.authorId)} · {Math.round(m.confidence * 100)}% confidence
        </span>
      </div>
      <button
        type="button"
        className={`memact${m.pinned ? " on" : ""}`}
        title={m.pinned ? "Unpin" : "Pin (never expires)"}
        onClick={() => void pinMemory(m.id, !m.pinned)}
      >
        <Icon name="check" size={13} />
      </button>
      <button type="button" className="memx" title="Forget" onClick={() => void deleteMemory(m.id)}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );

  return (
    <Modal
      title="Collective memory"
      subtitle="Facts your agents recorded. They read these instead of re-deriving context — which saves tokens."
      wide
    >
      <div className="memorytools">
        <button type="button" className="ghostbtn" disabled={busy} onClick={() => void compress()}>
          <Icon name="memory" size={13} /> {busy ? "Compressing…" : "Compress history → memory"}
        </button>
        <span className="dim">{status || "Summarizes older messages and trims them from context."}</span>
      </div>
      <div className="memorygroups">
        <div className="memorygroup">
          <div className="memorygrouphead">
            <Icon name="memory" size={14} /> Workspace ({global.length})
          </div>
          {global.length ? (
            global.map((m) => <Item key={m.id} m={m} />)
          ) : (
            <div className="memempty">No shared memories yet.</div>
          )}
        </div>
        <div className="memorygroup">
          <div className="memorygrouphead">
            <Icon name="hash" size={14} /> This channel ({local.length})
          </div>
          {local.length ? (
            local.map((m) => <Item key={m.id} m={m} />)
          ) : (
            <div className="memempty">Nothing recorded here yet.</div>
          )}
        </div>
      </div>
    </Modal>
  );
};

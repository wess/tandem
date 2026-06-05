import { useEffect, useState } from "react";
import type { Schedule } from "../../../shared/types.ts";
import { createSchedule, deleteSchedule, updateScheduleItem } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { invoke, on } from "../../transport.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";

const CADENCES = [
  { label: "Every 15 min", m: 15 },
  { label: "Hourly", m: 60 },
  { label: "Every 6 hours", m: 360 },
  { label: "Daily", m: 1440 },
  { label: "Weekly", m: 10080 },
];
const cadenceLabel = (m: number): string => CADENCES.find((c) => c.m === m)?.label ?? `${m} min`;

export const SchedulePanel = ({ channelId }: { channelId: number }) => {
  const members = useStore((s) => s.membersByChannel[channelId]) ?? [];
  const [items, setItems] = useState<Schedule[]>([]);
  const [agentId, setAgentId] = useState<number | "">("");
  const [prompt, setPrompt] = useState("");
  const [interval, setIntervalMinutes] = useState(1440);

  useEffect(() => {
    const refresh = () => void invoke("schedules:list", { channelId }).then(setItems);
    refresh();
    return on("schedules:changed", (d) => {
      if (d.channelId === channelId) refresh();
    });
  }, [channelId]);

  const agentName = (id: number): string => members.find((m) => m.id === id)?.name ?? "—";
  const create = async () => {
    if (agentId === "" || !prompt.trim()) return;
    await createSchedule({ channelId, agentId: Number(agentId), prompt: prompt.trim(), intervalMinutes: interval });
    setPrompt("");
  };

  return (
    <Modal
      title="Scheduled tasks"
      subtitle="Have an agent post on a recurring schedule — it fires even while you're away."
    >
      <div className="schedlist">
        {items.map((s) => (
          <div className="schedrow" key={s.id}>
            <div className="schedmeta">
              <span className="schedname">
                {agentName(s.agentId)} · {cadenceLabel(s.intervalMinutes)}
              </span>
              <span className="schedprompt">{s.prompt}</span>
            </div>
            <button
              type="button"
              className={`togglebtn${s.enabled ? " on" : ""}`}
              onClick={() => void updateScheduleItem({ id: s.id, enabled: !s.enabled })}
            >
              {s.enabled ? "On" : "Off"}
            </button>
            <button type="button" className="memx" title="Delete" onClick={() => void deleteSchedule(s.id)}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="memempty">No scheduled tasks yet.</div>}
      </div>
      <div className="customform skillform">
        <div className="formrow">
          <label>
            Agent
            <select value={agentId} onChange={(e) => setAgentId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Pick an agent…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cadence
            <select value={interval} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
              {CADENCES.map((c) => (
                <option key={c.m} value={c.m}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Task
          <textarea
            rows={2}
            value={prompt}
            placeholder="e.g. Summarize what changed today and flag anything risky"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <div className="formfoot">
          <button
            type="button"
            className="primary"
            disabled={agentId === "" || !prompt.trim()}
            onClick={() => void create()}
          >
            Add schedule
          </button>
        </div>
      </div>
    </Modal>
  );
};

import { useState } from "react";
import type { TeamSuggestion } from "../../../shared/types.ts";
import { createProject, createTeamFromSuggestion, suggestTeam } from "../../state/actions.ts";
import { Modal } from "../modal.tsx";

export const CreateProject = () => {
  const [mode, setMode] = useState<"suggest" | "blank">("suggest");

  // blank mode
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");

  // suggest mode
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<TeamSuggestion | null>(null);

  const runSuggest = async (): Promise<void> => {
    if (!goal.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setSuggestion(await suggestTeam(goal.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't suggest a team");
    } finally {
      setBusy(false);
    }
  };

  const create = async (): Promise<void> => {
    if (!suggestion) return;
    setBusy(true);
    setError(null);
    try {
      await createTeamFromSuggestion(suggestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the team");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New project"
      subtitle="Describe what you want to do and Tandem assembles a team — reusing your agents where they fit."
    >
      <div className="customform">
        <div className="teamtabs">
          <button type="button" className={mode === "suggest" ? "on" : ""} onClick={() => setMode("suggest")}>
            Suggest a team
          </button>
          <button type="button" className={mode === "blank" ? "on" : ""} onClick={() => setMode("blank")}>
            Blank
          </button>
        </div>

        {mode === "blank" ? (
          <>
            <label>
              Name
              <input value={name} placeholder="e.g. launch-plan" onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Topic
              <input value={topic} placeholder="Optional description" onChange={(e) => setTopic(e.target.value)} />
            </label>
            <div className="formfoot">
              <button type="button" className="primary" disabled={!name.trim()} onClick={() => void createProject(name, topic)}>
                Create project
              </button>
            </div>
          </>
        ) : !suggestion ? (
          <>
            <label>
              Goal
              <textarea
                value={goal}
                rows={4}
                placeholder="e.g. Plan and build a marketing site — research the market, write the copy, design it, and produce a build plan."
                // biome-ignore lint/a11y/noAutofocus: single-field create dialog
                autoFocus
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            {error && <div className="formerror">{error}</div>}
            <div className="formfoot">
              <button type="button" className="primary" disabled={busy || !goal.trim()} onClick={() => void runSuggest()}>
                {busy ? "Thinking…" : "Suggest a team"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="teampreview">
              <div className="teamhead">
                <span className="teamname">#{suggestion.name}</span>
                {suggestion.rationale && <span className="teamrationale">{suggestion.rationale}</span>}
              </div>
              <ul className="teammembers">
                {suggestion.members.map((m) => (
                  <li key={m.handle}>
                    <span className="teamavatar">{m.avatar ?? "🤖"}</span>
                    <span className="teamwho">
                      <b>{m.name}</b> <span className="teamhandle">@{m.handle}</span>
                      {m.role && <span className="teamrole">{m.role}</span>}
                    </span>
                    <span className="teambadges">
                      {m.lead && <span className="teambadge lead">lead</span>}
                      <span className={`teambadge ${m.reuse ? "reuse" : "fresh"}`}>{m.reuse ? "reused" : "new"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {error && <div className="formerror">{error}</div>}
            <div className="formfoot">
              <button type="button" className="ghost" disabled={busy} onClick={() => setSuggestion(null)}>
                Try again
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void create()}>
                {busy ? "Creating…" : "Create team"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

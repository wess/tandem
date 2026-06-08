import { useState } from "react";
import { acceptTeamSuggestion, dismissTeamSuggestion } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";

// M1.5 — an accept-prompt card for a server-proposed team. Renders off
// store.teamSuggestionByChannel[channelId]; Accept assembles the team (a new
// project channel) and clears the prompt, Dismiss just clears it. The
// originating channel keeps its message either way — this is an additive offer.
export const TeamSuggestionCard = ({ channelId }: { channelId: number }) => {
  const pending = useStore((s) => s.teamSuggestionByChannel[channelId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pending) return null;
  const { suggestion } = pending;

  const accept = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await acceptTeamSuggestion(channelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't assemble the team");
      setBusy(false);
    }
  };

  return (
    <div className="suggestcard">
      <div className="suggesthead">
        <span className="suggestkicker">
          <Icon name="sparkles" size={13} /> Suggested team
        </span>
        <span className="suggestname">#{suggestion.name}</span>
        {suggestion.rationale && <span className="suggestrationale">{suggestion.rationale}</span>}
      </div>
      <ul className="suggestmembers">
        {suggestion.members.map((m) => (
          <li key={m.handle}>
            <span className="suggestavatar">{m.avatar ?? "🤖"}</span>
            <span className="suggestwho">
              <b>{m.name}</b> <span className="suggesthandle">@{m.handle}</span>
              {m.role && <span className="suggestrole">{m.role}</span>}
            </span>
            <span className="suggestbadges">
              {m.lead && <span className="suggestbadge lead">lead</span>}
              <span className={`suggestbadge ${m.reuse ? "reuse" : "fresh"}`}>{m.reuse ? "reused" : "new"}</span>
            </span>
          </li>
        ))}
      </ul>
      {error && <div className="formerror">{error}</div>}
      <div className="suggestfoot">
        <button type="button" className="ghost" disabled={busy} onClick={() => dismissTeamSuggestion(channelId)}>
          Dismiss
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void accept()}>
          {busy ? "Assembling…" : "Accept team"}
        </button>
      </div>
    </div>
  );
};

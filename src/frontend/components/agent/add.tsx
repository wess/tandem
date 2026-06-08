import { useState } from "react";
import { slugifyHandle } from "../../../shared/mentions.ts";
import type { AgentKind, ProviderConfig, ProviderKind } from "../../../shared/types.ts";
import { addAgentFromTemplate, createAgent } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";

const EMOJIS = ["🤖", "🧠", "✨", "🎨", "🦙", "📝", "🗺️", "🛰️", "🔭", "🧪", "🦊", "🐙", "🌶️", "⚡", "🧭", "📚"];
const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#64748b"];
const IMAGE_MODELS = ["gpt-image-1", "dall-e-3"]; // OpenAI image models (images API, not chat)

const keyHint = (providers: ProviderConfig[], kind: ProviderKind): string | null => {
  const p = providers.find((x) => x.kind === kind);
  return p && p.needsKey && !p.hasKey ? `Needs ${p.label} key` : null;
};

const Preset = () => {
  const templates = useStore((s) => s.templates);
  const providers = useStore((s) => s.providers);
  return (
    <div className="presetgrid">
      {templates.map((t) => {
        const hint = keyHint(providers, t.providerKind);
        return (
          <button type="button" key={t.handle} className="presetcard" onClick={() => void addAgentFromTemplate(t)}>
            <span className="presetavatar" style={{ background: t.color }}>
              {t.avatar}
            </span>
            <span className="presetname">{t.name}</span>
            <span className="presetblurb">{t.blurb}</span>
            <span className="presetmeta">
              <span className="chip">{t.providerKind}</span>
              {t.kind === "image" && <span className="chip alt">image</span>}
              {hint && <span className="chip warn">{hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const Custom = () => {
  const providers = useStore((s) => s.providers);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatar, setAvatar] = useState(EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [providerKind, setProviderKind] = useState<ProviderKind>("anthropic");
  const provider = providers.find((p) => p.kind === providerKind);
  const [model, setModel] = useState(provider?.defaultModel ?? "");
  const [kind, setKind] = useState<AgentKind>("chat");
  const [prompt, setPrompt] = useState("");

  const effectiveHandle = handle || slugifyHandle(name);
  const hint = keyHint(providers, providerKind);

  const pickProvider = (k: ProviderKind) => {
    setProviderKind(k);
    const p = providers.find((x) => x.kind === k);
    setModel(p?.defaultModel ?? "");
    if (k !== "openai") setKind("chat");
  };

  const pickKind = (k: AgentKind) => {
    setKind(k);
    setModel(k === "image" ? IMAGE_MODELS[0] : (provider?.defaultModel ?? ""));
  };

  const modelOptions = kind === "image" ? IMAGE_MODELS : (provider?.models ?? []);

  const submit = () => {
    if (!name.trim() || !model) return;
    void createAgent({
      handle: effectiveHandle,
      name: name.trim(),
      avatar,
      color,
      providerKind,
      model,
      systemPrompt: prompt.trim(),
      kind,
    });
  };

  return (
    <div className="customform">
      <div className="formrow">
        <label>
          Name
          <input value={name} placeholder="e.g. Nova" onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Handle
          <div className="handlefield">
            <span>@</span>
            <input
              value={effectiveHandle}
              placeholder="nova"
              onChange={(e) => setHandle(slugifyHandle(e.target.value))}
            />
          </div>
        </label>
      </div>

      <label>
        Avatar
        <div className="picker">
          {EMOJIS.map((e) => (
            <button type="button" key={e} className={`emoji${e === avatar ? " on" : ""}`} onClick={() => setAvatar(e)}>
              {e}
            </button>
          ))}
        </div>
      </label>

      <label>
        Color
        <div className="picker">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch${c === color ? " on" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </label>

      <div className="formrow">
        <label>
          Provider
          <select value={providerKind} onChange={(e) => pickProvider(e.target.value as ProviderKind)}>
            {providers.map((p) => (
              <option key={p.kind} value={p.kind}>
                {p.label}
                {p.needsKey && !p.hasKey ? " (no key)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <input
            list={`agent-model-${providerKind}`}
            value={model}
            placeholder="model name (e.g. llama3.2)"
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id={`agent-model-${providerKind}`}>
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>

      {providerKind === "openai" && (
        <div className="kindtoggle">
          <button type="button" className={kind === "chat" ? "on" : ""} onClick={() => pickKind("chat")}>
            <Icon name="message" size={14} /> Chat
          </button>
          <button type="button" className={kind === "image" ? "on" : ""} onClick={() => pickKind("image")}>
            <Icon name="image" size={14} /> Image
          </button>
        </div>
      )}

      {kind === "chat" && (
        <label>
          System prompt
          <textarea
            value={prompt}
            rows={3}
            placeholder="Describe this agent's personality, role, and how it should respond."
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
      )}

      <div className="formfoot">
        {hint && <span className="hintwarn">⚠ {hint} — set it in Settings</span>}
        <button type="button" className="primary" disabled={!name.trim() || !model} onClick={submit}>
          Create agent
        </button>
      </div>
    </div>
  );
};

export const AddAgent = () => {
  const [tab, setTab] = useState<"preset" | "custom">("preset");
  return (
    <Modal title="Add an agent" subtitle="Pick a ready-made agent or design your own." wide>
      <div className="tabs">
        <button type="button" className={tab === "preset" ? "on" : ""} onClick={() => setTab("preset")}>
          Predefined
        </button>
        <button type="button" className={tab === "custom" ? "on" : ""} onClick={() => setTab("custom")}>
          Create your own
        </button>
      </div>
      {tab === "preset" ? <Preset /> : <Custom />}
    </Modal>
  );
};

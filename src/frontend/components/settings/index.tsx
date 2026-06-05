import { useState } from "react";
import type { ProviderConfig } from "../../../shared/types.ts";
import { setProviderConfig, setProviderKey } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";

const ProviderCard = ({ p }: { p: ProviderConfig }) => {
  const [key, setKey] = useState("");
  const [baseURL, setBaseURL] = useState(p.baseURL);
  const [model, setModel] = useState(p.defaultModel);
  const [saved, setSaved] = useState(false);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const saveKey = async () => {
    if (!key.trim()) return;
    await setProviderKey(p.kind, key.trim());
    setKey("");
    flash();
  };
  const saveCfg = async () => {
    await setProviderConfig(p.kind, { baseURL, defaultModel: model });
    flash();
  };

  return (
    <div className="provcard">
      <div className="provhead">
        <span className="provname">{p.label}</span>
        <span className={`status ${p.needsKey ? (p.hasKey ? "ok" : "bad") : "ok"}`}>
          {p.needsKey ? (p.hasKey ? "Key set" : "No key") : "Local"}
        </span>
      </div>
      {p.needsKey && (
        <div className="provfield">
          <input
            type="password"
            value={key}
            placeholder={p.hasKey ? "Replace API key…" : "Paste API key…"}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="button" className="ghostbtn" disabled={!key.trim()} onClick={() => void saveKey()}>
            <Icon name="lock" size={13} /> Save key
          </button>
        </div>
      )}
      <div className="provrow">
        <label className="mini">
          Default model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {p.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="mini">
          Base URL
          <input value={baseURL} placeholder="default" onChange={(e) => setBaseURL(e.target.value)} />
        </label>
      </div>
      <div className="provfoot">
        <button type="button" className="ghostbtn" onClick={() => void saveCfg()}>
          Save
        </button>
        {saved && (
          <span className="savedtag">
            <Icon name="check" size={13} /> Saved
          </span>
        )}
      </div>
    </div>
  );
};

export const Settings = () => {
  const providers = useStore((s) => s.providers);
  return (
    <Modal title="Settings" subtitle="Connect AI providers. Keys live in your OS keychain — never written to disk.">
      <div className="provlist">
        {providers.map((p) => (
          <ProviderCard key={p.kind} p={p} />
        ))}
      </div>
    </Modal>
  );
};

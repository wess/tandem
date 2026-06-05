import { useEffect, useState } from "react";
import type { Skill } from "../../../shared/types.ts";
import { deleteSkill, saveSkill } from "../../state/actions.ts";
import { invoke, on } from "../../transport.ts";
import { Icon } from "../icon.tsx";
import { Modal } from "../modal.tsx";

export const SkillsPanel = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [steps, setSteps] = useState("");

  useEffect(() => {
    void invoke("skills:list", undefined).then(setSkills);
    return on("skills:changed", ({ skills: next }) => setSkills(next));
  }, []);

  const create = async () => {
    if (!name.trim() || !steps.trim()) return;
    await saveSkill({ name: name.trim(), description: desc.trim(), steps: steps.trim() });
    setName("");
    setDesc("");
    setSteps("");
  };

  return (
    <Modal
      title="Skills"
      subtitle="Reusable procedures agents can follow and refine. Agents save them with SKILL: name :: steps."
      wide
    >
      <div className="skilllist">
        {skills.map((s) => (
          <div className="skillrow" key={s.id}>
            <div className="skillmeta">
              <span className="skillname">{s.name}</span>
              {s.description && <span className="dim">{s.description}</span>}
              <span className="skillsteps">{s.steps}</span>
            </div>
            <button type="button" className="memx" title="Delete" onClick={() => void deleteSkill(s.id)}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        {skills.length === 0 && (
          <div className="memempty">No skills yet. Agents create them as they work, or add one below.</div>
        )}
      </div>
      <div className="customform skillform">
        <div className="formrow">
          <label>
            Name
            <input value={name} placeholder="release-checklist" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Description
            <input value={desc} placeholder="What it's for" onChange={(e) => setDesc(e.target.value)} />
          </label>
        </div>
        <label>
          Steps
          <textarea rows={3} value={steps} placeholder="1. …&#10;2. …" onChange={(e) => setSteps(e.target.value)} />
        </label>
        <div className="formfoot">
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || !steps.trim()}
            onClick={() => void create()}
          >
            Save skill
          </button>
        </div>
      </div>
    </Modal>
  );
};

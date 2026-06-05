import { useState } from "react";
import { createProject } from "../../state/actions.ts";
import { Modal } from "../modal.tsx";

export const CreateProject = () => {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");

  return (
    <Modal title="New project" subtitle="A project is a channel for focused work. Invite agents once it's created.">
      <div className="customform">
        <label>
          Name
          {/* biome-ignore lint/a11y/noAutofocus: a single-field create dialog */}
          <input value={name} placeholder="e.g. launch-plan" autoFocus onChange={(e) => setName(e.target.value)} />
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
      </div>
    </Modal>
  );
};

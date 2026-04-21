import { useEffect, useState } from "react";
import { api } from "../api";

interface Props {
  envs: string[];
  onClose: () => void;
}

export function EnvEditor({ envs, onClose }: Props) {
  const [active, setActive] = useState(envs[0] ?? "demo");
  const [content, setContent] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!active) return;
    setStatus("");
    api.getEnvRaw(active).then(setContent);
  }, [active]);

  const save = async () => {
    await api.saveEnvRaw(active, content);
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 1500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit environment files</h3>
          <button onClick={onClose}>×</button>
        </div>
        <div className="env-tabs">
          {envs.map((e) => (
            <button
              key={e}
              className={e === active ? "active" : ""}
              onClick={() => setActive(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <textarea
          className="env-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="KEY=VALUE one per line"
        />
        <div className="modal-footer">
          <span className="status">{status}</span>
          <span className="hint">Stored at ~/.local-postman/envs/{active}.env</span>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

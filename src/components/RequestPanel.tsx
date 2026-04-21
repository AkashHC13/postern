import { useEffect, useState } from "react";
import type { Auth, Collection, HttpMethod, KV, SavedRequest } from "../types";

interface Props {
  methods: HttpMethod[];
  request: SavedRequest;
  setRequest: (r: SavedRequest) => void;
  previewUrl: string;
  onSend: () => void;
  sending: boolean;
  collections: Collection[];
  currentCollection: string | null;
  onSave: (collectionName: string) => void;
}

type Tab = "params" | "headers" | "body" | "auth";

export function RequestPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("params");
  const [saveTarget, setSaveTarget] = useState<string>(
    props.currentCollection ?? props.collections[0]?.name ?? "",
  );
  useEffect(() => {
    if (props.currentCollection) setSaveTarget(props.currentCollection);
    else if (!saveTarget && props.collections[0]) setSaveTarget(props.collections[0].name);
  }, [props.currentCollection, props.collections]);
  const r = props.request;
  const set = (patch: Partial<SavedRequest>) => props.setRequest({ ...r, ...patch });

  return (
    <div className="request-panel">
      <div className="title-row">
        <input
          className="req-name"
          value={r.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Request name"
        />
        <select
          value={saveTarget}
          onChange={(e) => setSaveTarget(e.target.value)}
          title="Save to collection"
        >
          <option value="">Save to…</option>
          {props.collections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          disabled={!saveTarget}
          onClick={() => saveTarget && props.onSave(saveTarget)}
        >
          Save
        </button>
      </div>

      <div className="url-row">
        <select
          className={`method-select m-${r.method}`}
          value={r.method}
          onChange={(e) => set({ method: e.target.value as HttpMethod })}
        >
          {props.methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="url-input"
          placeholder="Enter URL (use {{VARIABLE}} for env vars)"
          value={r.url}
          onChange={(e) => set({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSend();
          }}
        />
        <button className="send-btn" onClick={props.onSend} disabled={props.sending}>
          {props.sending ? "Sending…" : "Send"}
        </button>
      </div>
      {r.url && (
        <div className="preview" title="Resolved URL">
          → {props.previewUrl}
        </div>
      )}

      <div className="tabs">
        <button className={tab === "params" ? "active" : ""} onClick={() => setTab("params")}>
          Params {countEnabled(r.params) > 0 ? `(${countEnabled(r.params)})` : ""}
        </button>
        <button
          className={tab === "headers" ? "active" : ""}
          onClick={() => setTab("headers")}
        >
          Headers {countEnabled(r.headers) > 0 ? `(${countEnabled(r.headers)})` : ""}
        </button>
        <button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")}>
          Body
        </button>
        <button className={tab === "auth" ? "active" : ""} onClick={() => setTab("auth")}>
          Auth{r.auth.type !== "none" ? ` (${r.auth.type})` : ""}
        </button>
      </div>

      <div className="tab-body">
        {tab === "params" && (
          <KVEditor
            rows={r.params}
            onChange={(params) => set({ params })}
            placeholderKey="query param"
          />
        )}
        {tab === "headers" && (
          <KVEditor
            rows={r.headers}
            onChange={(headers) => set({ headers })}
            placeholderKey="header"
          />
        )}
        {tab === "body" && (
          <textarea
            className="body-textarea"
            placeholder="Raw JSON body (or any text). Use {{VAR}} for substitution."
            value={r.body}
            onChange={(e) => set({ body: e.target.value })}
          />
        )}
        {tab === "auth" && <AuthEditor auth={r.auth} onChange={(auth) => set({ auth })} />}
      </div>
    </div>
  );
}

function countEnabled(rows: KV[]): number {
  return rows.filter((r) => r.enabled && r.key).length;
}

interface KVProps {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  placeholderKey: string;
}

function KVEditor({ rows, onChange, placeholderKey }: KVProps) {
  const update = (i: number, patch: Partial<KV>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...rows, { key: "", value: "", enabled: true }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="kv-editor">
      {rows.map((row, i) => (
        <div key={i} className="kv-row">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
          />
          <input
            placeholder={placeholderKey}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            placeholder="value"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button className="icon" onClick={() => remove(i)}>
            ×
          </button>
        </div>
      ))}
      <button className="add-row" onClick={add}>
        + Add row
      </button>
    </div>
  );
}

function AuthEditor({ auth, onChange }: { auth: Auth; onChange: (a: Auth) => void }) {
  return (
    <div className="auth-editor">
      <div className="auth-type">
        <label>
          <input
            type="radio"
            checked={auth.type === "none"}
            onChange={() => onChange({ type: "none" })}
          />
          None
        </label>
        <label>
          <input
            type="radio"
            checked={auth.type === "bearer"}
            onChange={() => onChange({ type: "bearer", token: "" })}
          />
          Bearer Token
        </label>
        <label>
          <input
            type="radio"
            checked={auth.type === "basic"}
            onChange={() => onChange({ type: "basic", username: "", password: "" })}
          />
          Basic Auth
        </label>
      </div>
      {auth.type === "bearer" && (
        <div className="auth-fields">
          <label>Token</label>
          <input
            value={auth.token}
            onChange={(e) => onChange({ type: "bearer", token: e.target.value })}
            placeholder="{{TOKEN}} or literal"
          />
        </div>
      )}
      {auth.type === "basic" && (
        <div className="auth-fields">
          <label>Username</label>
          <input
            value={auth.username}
            onChange={(e) => onChange({ ...auth, username: e.target.value })}
          />
          <label>Password</label>
          <input
            type="password"
            value={auth.password}
            onChange={(e) => onChange({ ...auth, password: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { Collection, Folder, HistoryEntry, SavedRequest } from "../types";

interface Props {
  collections: Collection[];
  envs: string[];
  activeEnv: string;
  history: HistoryEntry[];
  activeRequestId: string;
  onSelectRequest: (collectionName: string, req: SavedRequest) => void;
  onNewRequest: (collectionName: string | null) => void;
  onCreateCollection: (name: string) => void;
  onDeleteCollection: (name: string) => void;
  onDeleteRequest: (collectionName: string, id: string) => void;
  onChangeActiveEnv: (name: string) => void;
  onEditEnv: () => void;
  onClearHistory: () => void;
}

export function Sidebar(props: Props) {
  const [newColName, setNewColName] = useState("");
  const [tab, setTab] = useState<"collections" | "history">("collections");

  return (
    <aside className="sidebar">
      <div className="env-row">
        <label>Environment</label>
        <select
          value={props.activeEnv}
          onChange={(e) => props.onChangeActiveEnv(e.target.value)}
        >
          {props.envs.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button className="icon" onClick={props.onEditEnv} title="Edit env files">
          edit
        </button>
      </div>

      <div className="tabs">
        <button
          className={tab === "collections" ? "active" : ""}
          onClick={() => setTab("collections")}
        >
          Collections
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>

      {tab === "collections" ? (
        <div className="collections">
          <div className="new-collection">
            <input
              placeholder="New collection name"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  props.onCreateCollection(newColName);
                  setNewColName("");
                }
              }}
            />
            <button
              onClick={() => {
                props.onCreateCollection(newColName);
                setNewColName("");
              }}
            >
              +
            </button>
          </div>
          {props.collections.map((c) => (
            <CollectionNode
              key={c.name}
              collection={c}
              activeRequestId={props.activeRequestId}
              onSelectRequest={(req) => props.onSelectRequest(c.name, req)}
              onDeleteRequest={(id) => props.onDeleteRequest(c.name, id)}
              onNewRequestAtRoot={() => props.onNewRequest(c.name)}
              onDeleteCollection={() => props.onDeleteCollection(c.name)}
            />
          ))}
          {props.collections.length === 0 && (
            <div className="empty">No collections yet. Create one above.</div>
          )}
        </div>
      ) : (
        <div className="history">
          <div className="history-header">
            <span>{props.history.length} requests</span>
            <button onClick={props.onClearHistory}>Clear</button>
          </div>
          {props.history.map((h, i) => (
            <div key={i} className="history-item">
              <span className={`method m-${h.method}`}>{h.method}</span>
              <span className="hurl" title={h.url}>
                {h.url}
              </span>
              <span className={`status s-${Math.floor(h.status / 100)}`}>{h.status}</span>
              <span className="ms">{h.durationMs}ms</span>
            </div>
          ))}
          {props.history.length === 0 && <div className="empty">No requests yet.</div>}
        </div>
      )}
    </aside>
  );
}

interface CollectionNodeProps {
  collection: Collection;
  activeRequestId: string;
  onSelectRequest: (req: SavedRequest) => void;
  onDeleteRequest: (id: string) => void;
  onNewRequestAtRoot: () => void;
  onDeleteCollection: () => void;
}

function CollectionNode(props: CollectionNodeProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="collection">
      <div className="collection-row" style={{ paddingLeft: 0 }}>
        <button className="toggle" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"}
        </button>
        <span className="cname">{props.collection.name}</span>
        <button className="icon" onClick={props.onNewRequestAtRoot} title="New request">
          +
        </button>
        <button
          className="icon"
          onClick={() => {
            if (confirm(`Delete collection "${props.collection.name}"?`)) {
              props.onDeleteCollection();
            }
          }}
          title="Delete collection"
        >
          ×
        </button>
      </div>
      {open && (
        <Tree
          folders={props.collection.folders}
          requests={props.collection.requests}
          depth={1}
          activeRequestId={props.activeRequestId}
          onSelectRequest={props.onSelectRequest}
          onDeleteRequest={props.onDeleteRequest}
        />
      )}
    </div>
  );
}

interface TreeProps {
  folders: Folder[];
  requests: SavedRequest[];
  depth: number;
  activeRequestId: string;
  onSelectRequest: (req: SavedRequest) => void;
  onDeleteRequest: (id: string) => void;
}

function Tree(props: TreeProps) {
  const { folders, requests, depth } = props;
  if (folders.length === 0 && requests.length === 0) {
    return <div className="empty small" style={{ paddingLeft: indent(depth) }}>Empty</div>;
  }
  return (
    <div>
      {folders.map((f) => (
        <FolderNode
          key={f.id}
          folder={f}
          depth={depth}
          activeRequestId={props.activeRequestId}
          onSelectRequest={props.onSelectRequest}
          onDeleteRequest={props.onDeleteRequest}
        />
      ))}
      {requests.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          depth={depth}
          active={r.id === props.activeRequestId}
          onSelect={() => props.onSelectRequest(r)}
          onDelete={() => props.onDeleteRequest(r.id)}
        />
      ))}
    </div>
  );
}

interface FolderProps {
  folder: Folder;
  depth: number;
  activeRequestId: string;
  onSelectRequest: (req: SavedRequest) => void;
  onDeleteRequest: (id: string) => void;
}

function FolderNode({ folder, depth, activeRequestId, onSelectRequest, onDeleteRequest }: FolderProps) {
  const [open, setOpen] = useState(false);
  const count = countRequests(folder);
  return (
    <div className="folder">
      <div
        className="folder-row"
        style={{ paddingLeft: indent(depth) }}
        onClick={() => setOpen(!open)}
      >
        <span className="toggle">{open ? "▾" : "▸"}</span>
        <span className="folder-name">{folder.name}</span>
        <span className="folder-count">{count}</span>
      </div>
      {open && (
        <Tree
          folders={folder.folders}
          requests={folder.requests}
          depth={depth + 1}
          activeRequestId={activeRequestId}
          onSelectRequest={onSelectRequest}
          onDeleteRequest={onDeleteRequest}
        />
      )}
    </div>
  );
}

interface RequestRowProps {
  request: SavedRequest;
  depth: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function RequestRow({ request, depth, active, onSelect, onDelete }: RequestRowProps) {
  return (
    <div
      className={`request-row ${active ? "active" : ""}`}
      style={{ paddingLeft: indent(depth) }}
      onClick={onSelect}
    >
      <span className={`method m-${request.method}`}>{request.method}</span>
      <span className="rname" title={request.name}>
        {request.name}
      </span>
      <button
        className="icon"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${request.name}"?`)) onDelete();
        }}
      >
        ×
      </button>
    </div>
  );
}

function countRequests(folder: Folder): number {
  let n = folder.requests.length;
  for (const f of folder.folders) n += countRequests(f);
  return n;
}

function indent(depth: number): number {
  return 6 + depth * 12;
}

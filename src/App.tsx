import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { substitute } from "./utils/substitute";
import type {
  Collection,
  Folder,
  HistoryEntry,
  HttpMethod,
  KV,
  ResponseData,
  SavedRequest,
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { EnvEditor } from "./components/EnvEditor";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function emptyRequest(): SavedRequest {
  return {
    id: crypto.randomUUID(),
    name: "Untitled",
    method: "GET",
    url: "",
    headers: [],
    params: [],
    body: "",
    auth: { type: "none" },
  };
}

export function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [envs, setEnvs] = useState<Record<string, Record<string, string>>>({});
  const [activeEnv, setActiveEnv] = useState<string>("demo");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<SavedRequest>(emptyRequest());
  const [currentCollection, setCurrentCollection] = useState<string | null>(null);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEnvEditor, setShowEnvEditor] = useState(false);

  const refreshAll = useCallback(async () => {
    const [cols, es, st, h] = await Promise.all([
      api.listCollections(),
      api.listEnvs(),
      api.getState(),
      api.history(),
    ]);
    setCollections(cols);
    setEnvs(es);
    setHistory(h);
    if (st.activeEnv) setActiveEnv(st.activeEnv);
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const vars = envs[activeEnv] ?? {};

  const selectRequest = (collectionName: string, req: SavedRequest) => {
    setCurrentCollection(collectionName);
    setCurrent(JSON.parse(JSON.stringify(req)));
    setResponse(null);
    setError(null);
  };

  const newRequest = (collectionName: string | null) => {
    setCurrentCollection(collectionName);
    setCurrent(emptyRequest());
    setResponse(null);
    setError(null);
  };

  const saveCurrent = async (targetCollection: string) => {
    const existing = collections.find((c) => c.name === targetCollection);
    const col: Collection = existing
      ? JSON.parse(JSON.stringify(existing))
      : { name: targetCollection, folders: [], requests: [] };
    if (!replaceRequestInPlace(col, current)) {
      col.requests.push(current);
    }
    await api.saveCollection(col);
    setCurrentCollection(targetCollection);
    await refreshAll();
  };

  const createCollection = async (name: string) => {
    if (!name.trim()) return;
    await api.saveCollection({ name: name.trim(), folders: [], requests: [] });
    await refreshAll();
  };

  const deleteCollection = async (name: string) => {
    await api.deleteCollection(name);
    if (currentCollection === name) setCurrentCollection(null);
    await refreshAll();
  };

  const deleteRequest = async (collectionName: string, id: string) => {
    const col = collections.find((c) => c.name === collectionName);
    if (!col) return;
    const copy: Collection = JSON.parse(JSON.stringify(col));
    removeRequestFromTree(copy, id);
    await api.saveCollection(copy);
    await refreshAll();
  };

  const changeActiveEnv = async (name: string) => {
    setActiveEnv(name);
    await api.setState({ activeEnv: name });
  };

  const send = async () => {
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const url = buildUrl(current.url, current.params, vars);
      const headers = buildHeaders(current.headers, current.auth, vars);
      const body = current.body ? substitute(current.body, vars) : undefined;
      const r = await api.send({
        method: current.method,
        url,
        headers,
        body,
      });
      setResponse(r);
      await api.history().then(setHistory);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSending(false);
    }
  };

  const previewUrl = useMemo(() => {
    try {
      return buildUrl(current.url, current.params, vars);
    } catch {
      return current.url;
    }
  }, [current.url, current.params, vars]);

  return (
    <div className="app">
      <Sidebar
        collections={collections}
        envs={Object.keys(envs)}
        activeEnv={activeEnv}
        history={history}
        onSelectRequest={selectRequest}
        onNewRequest={newRequest}
        onCreateCollection={createCollection}
        onDeleteCollection={deleteCollection}
        onDeleteRequest={deleteRequest}
        onChangeActiveEnv={changeActiveEnv}
        onEditEnv={() => setShowEnvEditor(true)}
        onClearHistory={async () => {
          await api.clearHistory();
          setHistory([]);
        }}
        activeRequestId={current.id}
      />
      <div className="main">
        <RequestPanel
          methods={METHODS}
          request={current}
          setRequest={setCurrent}
          previewUrl={previewUrl}
          onSend={send}
          sending={sending}
          collections={collections}
          currentCollection={currentCollection}
          onSave={saveCurrent}
        />
        <ResponsePanel response={response} error={error} sending={sending} />
      </div>
      {showEnvEditor && (
        <EnvEditor
          envs={Object.keys(envs)}
          onClose={async () => {
            setShowEnvEditor(false);
            await refreshAll();
          }}
        />
      )}
    </div>
  );
}

function buildUrl(urlTemplate: string, params: KV[], vars: Record<string, string>): string {
  const resolved = substitute(urlTemplate, vars);
  const enabled = params.filter((p) => p.enabled && p.key);
  if (enabled.length === 0) return resolved;
  const qs = enabled
    .map(
      (p) =>
        `${encodeURIComponent(p.key)}=${encodeURIComponent(substitute(p.value, vars))}`,
    )
    .join("&");
  return resolved.includes("?") ? `${resolved}&${qs}` : `${resolved}?${qs}`;
}

function replaceRequestInPlace(
  node: Collection | Folder,
  req: SavedRequest,
): boolean {
  const idx = node.requests.findIndex((r) => r.id === req.id);
  if (idx >= 0) {
    node.requests[idx] = req;
    return true;
  }
  for (const f of node.folders) {
    if (replaceRequestInPlace(f, req)) return true;
  }
  return false;
}

function removeRequestFromTree(node: Collection | Folder, id: string): boolean {
  const before = node.requests.length;
  node.requests = node.requests.filter((r) => r.id !== id);
  if (node.requests.length !== before) return true;
  for (const f of node.folders) {
    if (removeRequestFromTree(f, id)) return true;
  }
  return false;
}

function buildHeaders(
  headers: KV[],
  auth: SavedRequest["auth"],
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (h.enabled && h.key) out[h.key] = substitute(h.value, vars);
  }
  if (auth.type === "bearer" && auth.token) {
    out["Authorization"] = `Bearer ${substitute(auth.token, vars)}`;
  } else if (auth.type === "basic") {
    const u = substitute(auth.username, vars);
    const p = substitute(auth.password, vars);
    out["Authorization"] = `Basic ${btoa(`${u}:${p}`)}`;
  }
  return out;
}

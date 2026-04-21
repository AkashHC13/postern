import type { Collection, HistoryEntry, ResponseData } from "./types";

const AUTH_HEADER = "X-Auth-Token";
const AUTH_VALUE: string =
  typeof __AUTH_TOKEN__ !== "undefined" ? __AUTH_TOKEN__ : "";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { [AUTH_HEADER]: AUTH_VALUE, ...(extra ?? {}) };
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listCollections: () =>
    fetch("/api/collections", { headers: authHeaders() }).then(json<Collection[]>),
  saveCollection: (c: Collection) =>
    fetch(`/api/collections/${encodeURIComponent(c.name)}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(c),
    }).then(json<{ ok: true }>),
  deleteCollection: (name: string) =>
    fetch(`/api/collections/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then(json<{ ok: true }>),

  listEnvs: () =>
    fetch("/api/envs", { headers: authHeaders() }).then(
      json<Record<string, Record<string, string>>>,
    ),
  getEnvRaw: (name: string) =>
    fetch(`/api/envs/${encodeURIComponent(name)}/raw`, { headers: authHeaders() }).then((r) =>
      r.text(),
    ),
  saveEnvRaw: (name: string, content: string) =>
    fetch(`/api/envs/${encodeURIComponent(name)}/raw`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ content }),
    }).then(json<{ ok: true }>),

  getState: () =>
    fetch("/api/state", { headers: authHeaders() }).then(json<{ activeEnv?: string }>),
  setState: (state: { activeEnv?: string }) =>
    fetch("/api/state", {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(state),
    }).then(json<{ ok: true }>),

  history: () => fetch("/api/history", { headers: authHeaders() }).then(json<HistoryEntry[]>),
  clearHistory: () =>
    fetch("/api/history", { method: "DELETE", headers: authHeaders() }).then(
      json<{ ok: true }>,
    ),

  send: (payload: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }) =>
    fetch("/api/request", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).then(json<ResponseData>),
};

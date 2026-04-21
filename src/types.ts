export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface KV {
  key: string;
  value: string;
  enabled: boolean;
}

export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KV[];
  params: KV[];
  body: string;
  auth: Auth;
}

export interface Folder {
  id: string;
  name: string;
  folders: Folder[];
  requests: SavedRequest[];
}

export interface Collection {
  name: string;
  folders: Folder[];
  requests: SavedRequest[];
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
}

export interface HistoryEntry {
  ts: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
}

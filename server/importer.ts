import { randomUUID } from "node:crypto";

interface KV {
  key: string;
  value: string;
  enabled: boolean;
}
type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };
interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: KV[];
  params: KV[];
  body: string;
  auth: Auth;
}
interface Folder {
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

const PATH_SEP = " / ";

function convertVars(s: string): string {
  if (typeof s !== "string") return "";
  return s.replace(/<<([^<>]+)>>/g, "{{$1}}");
}

function isHoppscotchCollection(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  if (Array.isArray(raw.folders) && raw.folders.length > 0) {
    const f = raw.folders[0];
    if (f && (f.v !== undefined || Array.isArray(f.requests) || Array.isArray(f.folders))) {
      // Hoppscotch folders are objects with name/folders/requests.
      // Native folders also match this shape — so also check request shape.
      const r = findFirstRequest(raw);
      if (r && (typeof r.endpoint === "string" || r.auth?.authType !== undefined)) return true;
      if (r && (r.v !== undefined || r.body?.contentType !== undefined)) return true;
      return false;
    }
  }
  const r = Array.isArray(raw.requests) ? raw.requests[0] : null;
  if (r && (typeof r.endpoint === "string" || r.auth?.authType !== undefined)) return true;
  return false;
}

function findFirstRequest(node: any): any {
  if (Array.isArray(node.requests) && node.requests.length > 0) return node.requests[0];
  for (const f of node.folders ?? []) {
    const r = findFirstRequest(f);
    if (r) return r;
  }
  return null;
}

function mapKV(list: any[] | undefined): KV[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      key: String(x.key ?? ""),
      value: convertVars(String(x.value ?? "")),
      enabled: x.active !== false && x.enabled !== false,
    }));
}

function mapAuth(a: any): { auth: Auth; extraHeaders: KV[]; extraParams: KV[] } {
  const extraHeaders: KV[] = [];
  const extraParams: KV[] = [];
  if (!a || !a.authActive) return { auth: { type: "none" }, extraHeaders, extraParams };
  switch (a.authType) {
    case "bearer":
      return {
        auth: { type: "bearer", token: convertVars(String(a.token ?? "")) },
        extraHeaders,
        extraParams,
      };
    case "basic":
      return {
        auth: {
          type: "basic",
          username: convertVars(String(a.username ?? "")),
          password: convertVars(String(a.password ?? "")),
        },
        extraHeaders,
        extraParams,
      };
    case "api-key": {
      const key = String(a.key ?? "");
      const value = convertVars(String(a.value ?? ""));
      if (a.addTo === "QUERY_PARAMS") {
        extraParams.push({ key, value, enabled: true });
      } else {
        extraHeaders.push({ key, value, enabled: true });
      }
      return { auth: { type: "none" }, extraHeaders, extraParams };
    }
    default:
      return { auth: { type: "none" }, extraHeaders, extraParams };
  }
}

function mapHoppscotchRequest(r: any): SavedRequest {
  const { auth, extraHeaders, extraParams } = mapAuth(r.auth);
  const headers = [...mapKV(r.headers), ...extraHeaders];
  const params = [...mapKV(r.params), ...extraParams];

  const rawBody = r.body?.body;
  const body = typeof rawBody === "string" ? convertVars(rawBody) : "";
  const ct: string | null = r.body?.contentType ?? null;
  if (ct && !headers.some((h) => h.key.toLowerCase() === "content-type")) {
    headers.push({ key: "Content-Type", value: ct, enabled: true });
  }

  return {
    id: randomUUID(),
    name: String(r.name ?? "untitled"),
    method: String(r.method ?? "GET").toUpperCase(),
    url: convertVars(String(r.endpoint ?? r.url ?? "")),
    headers,
    params,
    body,
    auth,
  };
}

function mapHoppscotchFolder(f: any): Folder {
  return {
    id: randomUUID(),
    name: String(f.name ?? "folder"),
    folders: (f.folders ?? []).map(mapHoppscotchFolder),
    requests: (f.requests ?? []).map(mapHoppscotchRequest),
  };
}

/**
 * Rebuild nested folders from flattened request names separated by " / ".
 * Used for collections that were previously flattened before nested support existed.
 */
function splitFlattenedRequests(requests: SavedRequest[]): {
  folders: Folder[];
  requests: SavedRequest[];
} {
  const rootFolders: Folder[] = [];
  const rootRequests: SavedRequest[] = [];
  const folderLookup = new Map<string, Folder>();

  const ensureFolder = (pathParts: string[]): Folder | null => {
    if (pathParts.length === 0) return null;
    const key = pathParts.join(PATH_SEP);
    const existing = folderLookup.get(key);
    if (existing) return existing;
    const parent = pathParts.length > 1 ? ensureFolder(pathParts.slice(0, -1)) : null;
    const folder: Folder = {
      id: randomUUID(),
      name: pathParts[pathParts.length - 1],
      folders: [],
      requests: [],
    };
    folderLookup.set(key, folder);
    if (parent) parent.folders.push(folder);
    else rootFolders.push(folder);
    return folder;
  };

  for (const req of requests) {
    const parts = req.name.split(PATH_SEP);
    if (parts.length <= 1) {
      rootRequests.push(req);
      continue;
    }
    const leaf = parts[parts.length - 1];
    const folder = ensureFolder(parts.slice(0, -1));
    if (folder) folder.requests.push({ ...req, name: leaf });
    else rootRequests.push(req);
  }

  return { folders: rootFolders, requests: rootRequests };
}

/**
 * True if this looks like a native collection but was flattened before nested support.
 * Detected by: no `folders`, and some request name contains " / ".
 */
function needsFlatToNestedMigration(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  if (Array.isArray(raw.folders) && raw.folders.length > 0) return false;
  if (!Array.isArray(raw.requests)) return false;
  return raw.requests.some((r: any) => typeof r?.name === "string" && r.name.includes(PATH_SEP));
}

export function normalizeCollection(raw: any, fallbackName: string): Collection {
  if (isHoppscotchCollection(raw)) {
    return {
      name: String(raw.name ?? fallbackName),
      folders: (raw.folders ?? []).map(mapHoppscotchFolder),
      requests: (raw.requests ?? []).map(mapHoppscotchRequest),
    };
  }
  if (needsFlatToNestedMigration(raw)) {
    const { folders, requests } = splitFlattenedRequests(raw.requests);
    return {
      name: String(raw.name ?? fallbackName),
      folders,
      requests,
    };
  }
  return {
    name: String(raw?.name ?? fallbackName),
    folders: Array.isArray(raw?.folders) ? raw.folders : [],
    requests: Array.isArray(raw?.requests) ? raw.requests : [],
  };
}

export { isHoppscotchCollection, needsFlatToNestedMigration };

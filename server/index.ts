import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import {
  isHoppscotchCollection,
  needsFlatToNestedMigration,
  normalizeCollection,
} from "./importer.js";
import { ensureAuthToken } from "./auth-token.js";

const ROOT = path.join(os.homedir(), ".local-postman");
const COLLECTIONS_DIR = path.join(ROOT, "collections");
const ENVS_DIR = path.join(ROOT, "envs");
const HISTORY_FILE = path.join(ROOT, "history.json");
const STATE_FILE = path.join(ROOT, "state.json");
const HISTORY_LIMIT = 100;
const PORT = 5174;
const BIND_HOST = "127.0.0.1";

// Security: only requests arriving with these Host headers are allowed.
// This is the primary defense against DNS rebinding (attacker resolves their
// domain to 127.0.0.1, but the Host header they send is their attacker domain).
const ALLOWED_HOSTS = new Set([
  `localhost:${PORT}`,
  `127.0.0.1:${PORT}`,
  `[::1]:${PORT}`,
]);

// Security: only these Origins may call the API (browser-originated requests).
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

// Security: cloud provider instance-metadata endpoints — never forward there.
const BLOCKED_METADATA_ADDRESSES = new Set<string>([
  "169.254.169.254", // AWS / Azure / GCP / DigitalOcean / etc.
  "169.254.170.2",   // AWS ECS task metadata
  "100.100.100.200", // Alibaba Cloud
  "fd00:ec2::254",   // AWS IPv6 metadata
]);

ensureDir(ROOT, 0o700);
ensureDir(COLLECTIONS_DIR, 0o700);
ensureDir(ENVS_DIR, 0o700);

for (const name of ["prod", "demo", "stage"]) {
  const p = path.join(ENVS_DIR, `${name}.env`);
  if (!fsSync.existsSync(p)) {
    writeFileSecure(
      p,
      `# ${name} environment\n# KEY=VALUE pairs, one per line.\n# Use as {{KEY}} in URL, headers, or body.\nBASE_URL=https://httpbin.org\n`,
    );
  }
}
if (!fsSync.existsSync(STATE_FILE)) {
  writeFileSecure(STATE_FILE, JSON.stringify({ activeEnv: "demo" }, null, 2));
}
if (!fsSync.existsSync(HISTORY_FILE)) {
  writeFileSecure(HISTORY_FILE, "[]");
}
const sampleCollection = path.join(COLLECTIONS_DIR, "sample.json");
if (!fsSync.existsSync(sampleCollection)) {
  writeFileSecure(
    sampleCollection,
    JSON.stringify(
      {
        name: "sample",
        folders: [],
        requests: [
          {
            id: "r1",
            name: "httpbin GET",
            method: "GET",
            url: "{{BASE_URL}}/get",
            headers: [],
            params: [{ key: "hello", value: "world", enabled: true }],
            body: "",
            auth: { type: "none" },
          },
        ],
      },
      null,
      2,
    ),
  );
}

const AUTH_TOKEN = ensureAuthToken();

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      // Non-browser callers (curl) have no Origin — pass through; the token
      // check in the security middleware guards them.
      if (!origin) return cb(null, true);
      // Reflect only allowed origins. For others we return `false` (no CORS
      // headers) instead of erroring, letting our security middleware emit a
      // proper 403. The browser would block the cross-origin response anyway.
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: "10mb" }));

// Security middleware: enforce Host / Origin / token on every API call.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const host = String(req.headers.host ?? "");
  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({ error: "invalid Host header" });
  }
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "invalid Origin header" });
  }
  const token = String(req.headers["x-auth-token"] ?? "");
  if (!token || !timingSafeEqual(token, AUTH_TOKEN)) {
    return res.status(401).json({ error: "auth token required" });
  }
  next();
});

// --- Collections ---
app.get("/api/collections", async (_req, res) => {
  const files = await fs.readdir(COLLECTIONS_DIR);
  const out = [];
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    const filepath = resolveWithin(COLLECTIONS_DIR, f);
    if (!filepath) continue;
    try {
      const raw = JSON.parse(await fs.readFile(filepath, "utf8"));
      const fallback = f.replace(/\.json$/, "");
      if (isHoppscotchCollection(raw) || needsFlatToNestedMigration(raw)) {
        const normalized = normalizeCollection(raw, fallback);
        await writeFileSecureAsync(filepath, JSON.stringify(normalized, null, 2));
        console.log(`[local-postman] normalized ${f}`);
        out.push(normalized);
      } else {
        if (!Array.isArray(raw.folders)) raw.folders = [];
        if (!Array.isArray(raw.requests)) raw.requests = [];
        out.push(raw);
      }
    } catch (err) {
      console.error(`[local-postman] failed to read ${f}:`, err);
    }
  }
  res.json(out);
});

app.put("/api/collections/:name", async (req, res) => {
  const name = safeName(req.params.name);
  if (!name) return res.status(400).json({ error: "invalid name" });
  const target = resolveWithin(COLLECTIONS_DIR, `${name}.json`);
  if (!target) return res.status(400).json({ error: "invalid path" });
  const body = req.body;
  body.name = name;
  await writeFileSecureAsync(target, JSON.stringify(body, null, 2));
  res.json({ ok: true });
});

app.delete("/api/collections/:name", async (req, res) => {
  const name = safeName(req.params.name);
  if (!name) return res.status(400).json({ error: "invalid name" });
  const target = resolveWithin(COLLECTIONS_DIR, `${name}.json`);
  if (!target) return res.status(400).json({ error: "invalid path" });
  await fs.unlink(target).catch(() => {});
  res.json({ ok: true });
});

// --- Envs ---
app.get("/api/envs", async (_req, res) => {
  const files = await fs.readdir(ENVS_DIR);
  const out: Record<string, Record<string, string>> = {};
  for (const f of files.filter((x) => x.endsWith(".env"))) {
    const filepath = resolveWithin(ENVS_DIR, f);
    if (!filepath) continue;
    const name = f.replace(/\.env$/, "");
    out[name] = parseEnv(await fs.readFile(filepath, "utf8"));
  }
  res.json(out);
});

app.get("/api/envs/:name/raw", async (req, res) => {
  const name = safeName(req.params.name);
  if (!name) return res.status(400).json({ error: "invalid name" });
  const target = resolveWithin(ENVS_DIR, `${name}.env`);
  if (!target) return res.status(400).json({ error: "invalid path" });
  try {
    res.type("text/plain").send(await fs.readFile(target, "utf8"));
  } catch {
    res.type("text/plain").send("");
  }
});

app.put("/api/envs/:name/raw", async (req, res) => {
  const name = safeName(req.params.name);
  if (!name) return res.status(400).json({ error: "invalid name" });
  const target = resolveWithin(ENVS_DIR, `${name}.env`);
  if (!target) return res.status(400).json({ error: "invalid path" });
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  await writeFileSecureAsync(target, content);
  res.json({ ok: true });
});

// --- Active env state ---
app.get("/api/state", async (_req, res) => {
  const raw = await fs.readFile(STATE_FILE, "utf8").catch(() => "{}");
  res.json(JSON.parse(raw || "{}"));
});
app.put("/api/state", async (req, res) => {
  await writeFileSecureAsync(STATE_FILE, JSON.stringify(req.body ?? {}, null, 2));
  res.json({ ok: true });
});

// --- History ---
app.get("/api/history", async (_req, res) => {
  const raw = await fs.readFile(HISTORY_FILE, "utf8").catch(() => "[]");
  res.json(JSON.parse(raw || "[]"));
});
app.delete("/api/history", async (_req, res) => {
  await writeFileSecureAsync(HISTORY_FILE, "[]");
  res.json({ ok: true });
});

// --- Proxy: execute the actual HTTP request ---
app.post("/api/request", async (req, res) => {
  const { method, url, headers, body } = req.body as {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  const start = Date.now();
  try {
    await ssrfGuard(url);
    const init: RequestInit = { method, headers };
    if (body && !["GET", "HEAD"].includes(method.toUpperCase())) {
      init.body = body;
    }
    const r = await fetch(url, init);
    const buf = Buffer.from(await r.arrayBuffer());
    const respHeaders: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    const text = buf.toString("utf8");
    await appendHistory({
      ts: Date.now(),
      method,
      // Store host+path only (never query string / fragment) so tokens in
      // query params don't end up persisted on disk.
      url: redactUrl(url),
      status: r.status,
      durationMs: Date.now() - start,
    });
    res.json({
      status: r.status,
      statusText: r.statusText,
      headers: respHeaders,
      body: text,
      durationMs: Date.now() - start,
      sizeBytes: buf.byteLength,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || String(err),
      durationMs: Date.now() - start,
    });
  }
});

// ---- Helpers ----

function ensureDir(dir: string, mode: number) {
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true, mode });
  try {
    fsSync.chmodSync(dir, mode);
  } catch {}
}

function writeFileSecure(file: string, content: string) {
  fsSync.writeFileSync(file, content, { mode: 0o600 });
}

async function writeFileSecureAsync(file: string, content: string) {
  await fs.writeFile(file, content, { mode: 0o600 });
  try {
    await fs.chmod(file, 0o600);
  } catch {}
}

function safeName(name: string): string | null {
  if (!name) return null;
  // Disallow any path separators, leading dots, or shell-special chars.
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_\- .]*$/.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}

/**
 * Resolve `child` against `base` and assert the result stays inside `base`.
 * Defense-in-depth against path traversal even if safeName() is bypassed.
 */
function resolveWithin(base: string, child: string): string | null {
  const resolved = path.resolve(base, child);
  const baseResolved = path.resolve(base) + path.sep;
  if (!resolved.startsWith(baseResolved) && resolved !== path.resolve(base)) {
    return null;
  }
  return resolved;
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

async function appendHistory(entry: unknown) {
  const raw = await fs.readFile(HISTORY_FILE, "utf8").catch(() => "[]");
  const arr = JSON.parse(raw || "[]");
  arr.unshift(entry);
  if (arr.length > HISTORY_LIMIT) arr.length = HISTORY_LIMIT;
  await writeFileSecureAsync(HISTORY_FILE, JSON.stringify(arr, null, 2));
}

function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return rawUrl.split("?")[0];
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Guard the proxy endpoint against sending traffic to cloud-metadata IPs.
 * Private ranges (10/8, 192.168/16, 127/8, etc.) are deliberately *allowed*
 * — this tool exists to hit internal dev services.
 *
 * Note: there's a small TOCTOU gap between this DNS resolution and fetch()'s
 * own resolution. For a local tool this is acceptable. Closing it fully would
 * require a custom HTTP agent that connects to the resolved IP.
 */
async function ssrfGuard(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`protocol "${url.protocol}" not allowed`);
  }
  const hostname = url.hostname;
  const ipLiterals: string[] = [];
  if (isIP(hostname)) {
    ipLiterals.push(hostname);
  } else {
    try {
      const resolved = await dns.lookup(hostname, { all: true });
      for (const r of resolved) ipLiterals.push(r.address);
    } catch {
      throw new Error(`could not resolve ${hostname}`);
    }
  }
  for (const ip of ipLiterals) {
    if (BLOCKED_METADATA_ADDRESSES.has(ip) || ip.startsWith("169.254.")) {
      throw new Error(`address ${ip} blocked (link-local / cloud metadata)`);
    }
  }
}

app.listen(PORT, BIND_HOST, () => {
  console.log(`[local-postman] server listening on http://${BIND_HOST}:${PORT}`);
  console.log(`[local-postman] data dir: ${ROOT}`);
  console.log(`[local-postman] auth token ready (${AUTH_TOKEN.slice(0, 6)}…)`);
});

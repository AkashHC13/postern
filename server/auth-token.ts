import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const ROOT = path.join(os.homedir(), ".local-postman");
const TOKEN_FILE = path.join(ROOT, ".auth-token");

/**
 * Read the shared auth token, or create one on first run.
 * Called from both the Express server and vite.config.ts so that both sides
 * converge on the same token. File is 0600, directory 0700.
 */
export function ensureAuthToken(): string {
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing) return existing;
  } catch {
    // missing — create below
  }
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(ROOT, 0o700);
  } catch {}
  const token = crypto.randomBytes(32).toString("hex");
  const tmp = `${TOKEN_FILE}.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, token, { mode: 0o600 });
  try {
    fs.renameSync(tmp, TOKEN_FILE);
  } catch {
    // another process may have created it first — re-read
    try {
      fs.unlinkSync(tmp);
    } catch {}
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  }
  return token;
}

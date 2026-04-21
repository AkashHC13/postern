# local-postman

A Hoppscotch/Postman-like HTTP client that runs entirely on your machine. Collections and environments are stored as plain files under `~/.local-postman/`.

---

## 1. How to run

**Prerequisites:** Node 20+ and npm.

```bash
cd ~/mondu/local-postman
npm install        # first time only
npm run dev
```

Then open **http://localhost:5173**.

What happens on start:

- Vite serves the UI at `http://127.0.0.1:5173`
- Express backend runs at `http://127.0.0.1:5174` (proxies your HTTP requests to bypass browser CORS)
- Both bind to loopback only; nothing is reachable from the LAN

Stop:

```bash
pkill -f "concurrently.*dev:server"
```

---

## 2. What needs to be configured

### Environment files

On first run, three `.env` files are seeded at `~/.local-postman/envs/`:

```
~/.local-postman/envs/prod.env
~/.local-postman/envs/demo.env
~/.local-postman/envs/stage.env
```

Each is plain `KEY=VALUE`, one per line. Example:

```
BASE_URL=https://api.example.com
ACCESS_TOKEN=eyJhbGciOi...
MERCHANT_ID=abc-123
```

Edit them from the UI (✎ button next to the env dropdown) or directly on disk. Use variables in any request field with `{{VAR}}` syntax — URL, query params, headers, body, bearer token, Basic auth fields.

Switch the active environment with the dropdown at the top of the sidebar.

### Data layout

```
~/.local-postman/
├── .auth-token             shared token between UI and backend (0600)
├── collections/*.json      one file per collection
├── envs/*.env              one file per environment
├── history.json            last 100 requests (host+path only, no query)
└── state.json              active env selection
```

All files are `0600` / directory `0700` (owner-only).

### Ports

If `5173` or `5174` are taken, edit them in:

- `vite.config.ts` → `server.port` and `server.proxy["/api"].target`
- `server/index.ts` → `PORT` constant and `ALLOWED_HOSTS` entries

---

## 3. Migrating from Hoppscotch

The importer auto-detects Hoppscotch exports and converts them in place on first load. No UI button needed.

### Steps

**1. Export from Hoppscotch**

- Open Hoppscotch
- Collections panel → **⋯** → **Export as** → **Hoppscotch collection JSON**
- Save the file somewhere (e.g., `~/Downloads/mondu.json`)

**2. Drop the file into the collections directory**

```bash
cp ~/Downloads/mondu.json ~/.local-postman/collections/
```

**3. Refresh the UI**

- The backend detects Hoppscotch format on read
- Converts nested folders → native `folders[]` tree
- Rewrites `<<VAR>>` syntax → `{{VAR}}`
- Persists back as normalized JSON (original shape is overwritten — keep your export if you want a backup)

**4. Export your Hoppscotch environment**

Hoppscotch exports environments separately. For each one:

- In Hoppscotch: Environments → pick env → **Export**
- Open the JSON; it looks like `{ "variables": [{ "key": "BASE_URL", "value": "..." }, ...] }`
- Paste the keys/values into the corresponding `~/.local-postman/envs/{prod,demo,stage}.env` as `KEY=VALUE` lines

A quick conversion one-liner:

```bash
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
for(const v of j.variables||[])console.log(`${v.key}=${v.value}`)' \
  ~/Downloads/hoppscotch-env.json >> ~/.local-postman/envs/prod.env
```

### What the importer converts

| Hoppscotch | local-postman |
|---|---|
| Nested `folders[]` | Nested `folders[]` (preserved) |
| `request.endpoint` | `request.url` |
| `<<VAR>>` | `{{VAR}}` |
| `headers[].active` / `params[].active` | `.enabled` |
| `body.contentType` + `body.body` | body string + auto-injected `Content-Type` header |
| `auth.authType: "bearer"` | `{ type: "bearer", token }` |
| `auth.authType: "basic"` | `{ type: "basic", username, password }` |
| `auth.authType: "api-key"` | Injected as header or query param (respects `addTo`) |
| `auth.authType: "none"` | `{ type: "none" }` |

### What does not convert

- **Pre-request scripts / test scripts** — local-postman does not run JavaScript. Script fields are dropped.
- **Hoppscotch dynamic vars** (`<<$randomCompanyName>>`, `<<$timestamp>>`, etc.) — translated to `{{$randomCompanyName}}` but won't resolve unless you define them yourself in an env file.
- **OAuth 2.0 / Digest auth** — not supported. Only None, Bearer, Basic.
- **GraphQL / WebSocket / SSE requests** — REST only.
- **Request-level description text** — not rendered (data is preserved in the JSON but not shown).

---

## Security notes

- Loopback-only bind (`127.0.0.1`) — not reachable from other devices on your network
- Strict `Host` + `Origin` allowlist on every API call (blocks DNS rebinding)
- Auth token required on every `/api/*` call, injected at dev-server start
- Proxy blocks cloud-metadata IPs (`169.254.169.254`, etc.) and non-`http(s)` schemes
- Data files are `0600` / directory `0700`
- History persists only `scheme://host/path` (no query strings, so URL-embedded tokens don't end up on disk)

Secrets in env files and collection JSON are stored in plaintext. File-mode `0600` protects from other users on the machine, but any process running as you can read them. Full at-rest encryption (Keychain-backed) is not implemented.

---

## Troubleshooting

**"401 auth token required"** — UI was loaded before the backend generated `~/.local-postman/.auth-token`. Refresh the browser.

**"403 invalid Host header"** — The Vite proxy isn't rewriting the Host header. Confirm `changeOrigin: true` in `vite.config.ts`.

**Collection shows as empty after import** — Check the file is valid JSON and lives under `~/.local-postman/collections/`. Server logs (stdout of `npm run dev`) will say `normalized <file>` on successful import.

**Want to wipe everything and start over:**

```bash
pkill -f "concurrently.*dev:server"
rm -rf ~/.local-postman
npm run dev        # recreates the dir with fresh seeds
```

---

## License

MIT License

Copyright (c) 2026 Akash Hullarike Chakresh

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

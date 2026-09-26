# HookLine

**Self-hosted webhook & API request inspector.** HookLine gives you a unique URL for
every integration you are testing. Anything sent to that URL — from Stripe, GitHub,
Twilio, a `curl` command or your own app — is captured, stored and shown in a clean
dashboard, with one-click replay and "copy as cURL / JavaScript / Python".

No account. No SaaS. No data leaving your machine.

```
POST /h/a1b2c3d4e5f6   →   dashboard: 402 Payment Required · 1.2 KB · x-hookline-status: 402
```

---

## Table of contents

- [What problem does it solve](#what-problem-does-it-solve)
- [Who it is for](#who-it-is-for)
- [Features](#features)
- [Technology](#technology)
- [Installation](#installation)
- [Running HookLine](#running-hookline)
- [Configuration](#configuration)
- [Day-to-day use](#day-to-day-use)
- [HTTP API](#http-api)
- [Response-shaping headers](#response-shaping-headers)
- [Where the data lives](#where-the-data-lives)
- [Customising the dashboard](#customising-the-dashboard)
- [Deploying](#deploying)
- [Running the tests](#running-the-tests)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What problem does it solve

You are integrating a webhook. To see what the provider actually sends you, you need
an HTTPS URL that is publicly reachable. The usual options are all bad:

| Option | Problem |
| --- | --- |
| A hosted request bin | Requires an account, rate-limits you, keeps your production payloads on someone else's server |
| `ngrok` + a 40-line `server.js` | You rewrite the same throwaway server for every new integration |
| A staging server | Slow, and it does not tell you what your *local* code would do with the payload |

HookLine is that throwaway server, made properly: named endpoints, full request
history, search, replay and code generation — and it starts with one command.

## Who it is for

- Backend developers wiring up Stripe, Shopify, Twilio, GitHub, Slack or Zapier.
- Indie developers testing a third-party API before writing the integration.
- Anyone who needs to reproduce a webhook locally: *"what exactly did they send?"*

## Features

**Capture**
- Unlimited endpoints, each with its own URL and its own retention window.
- Any HTTP method, any sub-path (`/h/<token>/stripe/charges`).
- JSON, form-encoded, plain text and binary payloads (stored as base64, never corrupted).
- Query string, headers, remote address, size and response status for every request.
- Optional shared secret per endpoint (`x-hookline-secret`) for realistic signature tests.
- Sensitive query parameters (`access_token`, `signature`, …) are redacted before storage.

**Inspect**
- Live dashboard with auto-refresh (3 s), manual refresh, and per-endpoint statistics.
- Search across path, headers and body; filter by method and by response status class.
- Cursor pagination — scroll back through your whole history.
- Detail drawer with tabs for Body, Headers, Query, Code and Replay.
- Pretty-printed JSON, form payloads rendered as a table, binary payloads flagged.

**Act**
- **Replay** any captured request to any URL, optionally editing the payload first —
  the fastest way to test how your own handler reacts to a different body.
- **Copy as** cURL, `fetch`, Python `requests`, Node.js `http` or raw HTTP.
- **Export** an endpoint's history as a JSON file.

**Test your own error handling**
- `x-hookline-status`, `x-hookline-delay`, `x-hookline-body` and `x-hookline-content-type`
  let you make HookLine answer with whatever your integration will see in production.

**Operations**
- Single-file SQLite database, auto-pruned to each endpoint's retention window.
- API token required for every management call; constant-time comparison.
- Graceful shutdown, request log with `--dev`, zero runtime dependencies.

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js ≥ 22.5 (`node:http` only) | The tool *is* an HTTP server; a framework would add weight and nothing else |
| Database | `node:sqlite` (bundled with Node) | Structured, searchable, survives restarts — with zero `npm install` |
| Dashboard | Vanilla HTML + CSS + ES modules | No build step, no bundler, instant cold start, easy to restyle |
| Dependencies | **None** | `git clone && npm start` works offline |

A database **is** used, and it is justified: captured requests are structured,
append-only, searchable records that must outlive the process. A JSON file would mean
rewriting the whole file on every incoming webhook; SQLite handles concurrent writes
and indexed queries in a single file you can delete to reset everything.

## Installation

```bash
git clone https://github.com/YOUR-USERNAME/hookline.git
cd hookline
npm start
```

There is nothing to install — HookLine has no runtime dependencies. Cloning and
starting is the whole installation. Node.js 22.5 or newer is required (for
`node:sqlite`); check with `node --version`.

Optional, to use the `hookline` command from anywhere:

```bash
npm link          # then: hookline --port 8080
```

## Running HookLine

```bash
npm start                       # http://127.0.0.1:4000
npm run dev                     # same, but logs every request to the console
node src/cli.js --help          # all options
```

On first start you will see:

```
  HookLine 1.0.0 — webhook & request inspector
  ──────────────────────────────────────────────────────────────────
  Dashboard   http://127.0.0.1:4000
  Public URL  http://127.0.0.1:4000
  Endpoints   http://127.0.0.1:4000/h/<token>
  Database    /your/path/data/hookline.sqlite
  Retention   7 day(s)   Max body 1048576 bytes
  API token   k3f9x2…
  ──────────────────────────────────────────────────────────────────
```

Open the dashboard, paste the **API token** into the unlock screen (it is stored in
your browser's localStorage), create an endpoint and you have a URL to test against.

## Configuration

Every option can be set as a CLI flag or an environment variable. CLI wins.

| Flag | Environment variable | Default | Meaning |
| --- | --- | --- | --- |
| `-p, --port <n>` | `PORT` | `4000` | Port to listen on |
| `--host <addr>` | `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to reach it from your phone or another machine on the LAN |
| `--token <str>` | `HOOKLINE_TOKEN` | generated | Dashboard API token. Generated once and stored in the database |
| `--data <dir>` | `HOOKLINE_DATA` | `./data` | Directory holding `hookline.sqlite` |
| `--retention <days>` | `HOOKLINE_RETENTION` | `7` | Default retention for new endpoints |
| `--max-body <bytes>` | `HOOKLINE_MAX_BODY` | `1048576` | Largest captured body (1 MB) |
| `--public-url <url>` | `HOOKLINE_PUBLIC_URL` | `http://<host>:<port>` | Base URL used in generated links. Set this behind a tunnel or reverse proxy |
| `--dev` | `HOOKLINE_DEV` | off | Log every request |

Examples:

```bash
# reachable from your phone on the same Wi-Fi
node src/cli.js --host 0.0.0.0 --port 8080

# keep 30 days, allow 5 MB payloads, fixed token, no losing the URL behind a tunnel
node src/cli.js --retention 30 --max-body 5242880 --token my-secret --public-url https://hooks.example.com

# behind ngrok / Cloudflare Tunnel
ngrok http 4000
HOOKLINE_PUBLIC_URL=https://abc-123.ngrok-free.app node src/cli.js
```

> **Note** HookLine binds to `127.0.0.1` on purpose: your captured payloads may contain
> production data. Only use `--host 0.0.0.0` on a network you trust.

## Day-to-day use

**1. Create an endpoint.** In the dashboard: *+ New endpoint*. Optionally tick
*"Require a secret"* — HookLine generates one and copies it to your clipboard.

**2. Point something at it.**

```bash
# a quick manual test
curl -X POST http://127.0.0.1:4000/h/a1b2c3d4e5f6/charges \
  -H "content-type: application/json" \
  -d '{"id":"evt_1","amount":4200,"currency":"eur"}'

# a Stripe CLI signature test
stripe listen --forward-to http://127.0.0.1:4000/h/a1b2c3d4e5f6/stripe

# replay a real provider payload from a file
curl -X POST http://127.0.0.1:4000/h/a1b2c3d4e5f6/github \
  -H "content-type: application/json" \
  --data-binary @fixtures/github-push.json
```

The request appears in the dashboard within 3 seconds (or immediately — press
**Refresh**).

**3. Inspect it.** Click the row. The drawer shows the pretty-printed body, the
headers, the query string and copy-ready code in five languages.

**4. Replay it against your own code.** Open the **Replay** tab, change the target to
`http://localhost:3000/webhooks/stripe`, optionally edit the body, and press
**Send replay**. If the replay targets a HookLine endpoint, the new capture is linked
back to the original so you can compare them.

**5. Clean up.** *Clear* empties an endpoint, *Delete* removes it and its history.
Expired requests disappear automatically — nothing grows forever.

## HTTP API

All management calls need the API token, sent as `x-hookline-token: <token>`,
`Authorization: Bearer <token>` or `?token=<token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check (no auth) |
| `GET` | `/api/session` | Server info: version, public URL, limits |
| `GET` | `/api/bins` | List endpoints with counts |
| `POST` | `/api/bins` | Create an endpoint |
| `GET` | `/api/bins/:id` | Endpoint detail |
| `PATCH` | `/api/bins/:id` | Rename, pause/resume, change retention or secret |
| `DELETE` | `/api/bins/:id` | Delete the endpoint and its requests |
| `POST` | `/api/bins/:id/clear` | Delete stored requests, keep the endpoint |
| `GET` | `/api/bins/:id/requests` | List requests (`search`, `method`, `status`, `limit`, `before`) |
| `GET` | `/api/bins/:id/export` | Download history as JSON |
| `GET` | `/api/requests/:id` | Full request detail with code snippets |
| `POST` | `/api/requests/:id/replay` | Re-send the request (`url`, `method`, `headers`, `body`, `timeoutMs`) |
| `GET` | `/api/stats?binId=…` | Aggregate numbers |

Capture URLs (no auth) live under `/h/<token>` and accept any method.

Example session:

```bash
export HOOKLINE_TOKEN=k3f9x2   # the token from the startup banner

curl -s -X POST http://127.0.0.1:4000/api/bins \
  -H "x-hookline-token: $HOOKLINE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Shopify orders","retentionDays":14,"generateSecret":true}'

curl -s http://127.0.0.1:4000/api/bins -H "x-hookline-token: $HOOKLINE_TOKEN"
```

## Response-shaping headers

Send these to the capture URL to control what HookLine answers — useful for testing
retry and timeout behaviour in your own code.

| Header | Query equivalent | Effect |
| --- | --- | --- |
| `x-hookline-status` | `?__status=` | Answer with this status code (100–599) |
| `x-hookline-delay` | `?__delay=` | Wait this many ms before answering (max 30 000) |
| `x-hookline-body` | `?__body=` | Answer with this exact body |
| `x-hookline-content-type` | `?__type=` | Content type for the forced body |

```bash
# make Stripe-style retries happen on purpose
curl -X POST http://127.0.0.1:4000/h/a1b2c3d4e5f6/retry-test \
  -H "content-type: application/json" \
  -H "x-hookline-status: 500" \
  -d '{"note":"simulated failure"}'
```

A paused endpoint answers `503` with `{"error":"endpoint_paused"}` and stores nothing.

## Where the data lives

- `data/hookline.sqlite` — every endpoint and captured request (plus WAL files).
- Your browser's localStorage — the API token and the last selected endpoint.

To wipe everything: stop HookLine and `rm -rf data/`. To back it up: copy the `data/`
folder. The `.gitignore` already excludes it.

Binary payloads are stored base64-encoded, so an image or PDF round-trips byte for
byte. Text payloads are stored as UTF-8.

## Customising the dashboard

The dashboard is three files, no build step:

| File | What to change |
| --- | --- |
| `public/index.html` | Structure and copy |
| `public/styles.css` | Every colour is a CSS variable in `:root` — change `--accent` to rebrand in one line |
| `public/app.js` | Behaviour. The `start()` function wires everything up |

Typical changes: set your brand colour, change the page title and favicon
(`public/favicon.svg`), or adjust the poll interval (the `setInterval(…, 3000)` call
near the bottom of `app.js`).

## Deploying

HookLine is a single Node process with one stateful folder, so anything that runs
Node 22.5+ works.

**On a VPS or Raspberry Pi (most common):**

```bash
git clone https://github.com/YOUR-USERNAME/hookline.git
cd hookline
HOOKLINE_TOKEN=$(openssl rand -hex 24) nohup node src/cli.js --host 127.0.0.1 --port 4000 > hookline.log 2>&1 &
```

Put nginx or Caddy in front for TLS, then start HookLine with
`--public-url https://hooks.your-domain.com` so generated links are correct.

**Docker:**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOOKLINE_HOST=0.0.0.0 PORT=4000
VOLUME ["/app/data"]
EXPOSE 4000
CMD ["node", "src/cli.js"]
```

**Platforms without a persistent disk** (Heroku, Railway free tiers, Cloud Run) will
lose history on restart — fine for a demo, not for anything you care about. Mount a
volume or use `--data /data`.

**Exposing it publicly:** always set a token, always terminate TLS, and remember that
anyone with the URL can post to an endpoint. `x-hookline-secret` exists for exactly
this reason.

## Running the tests

```bash
npm test
```

44 tests covering configuration parsing, authentication, endpoint CRUD, capture
(JSON, form, binary, secrets, overrides, size limits), search/filter/pagination,
replay, export, retention pruning and static asset serving. No network access and no
dependencies required.

## Project structure

```
hookline/
├── src/
│   ├── cli.js            entry point: config → database → server → banner
│   ├── config.js         argv + env parsing
│   ├── server.js         request routing
│   ├── store.js          all SQL lives here
│   ├── db.js             SQLite connection + migrations
│   ├── lib/
│   │   ├── body.js       body reading, size limits, JSON/form/binary detection
│   │   ├── format.js     cURL / fetch / Python / Node / HTTP generators
│   │   ├── http.js       response helpers, constant-time compare
│   │   └── replay.js     outbound requests with timeouts
│   └── routes/
│       ├── capture.js    the public /h/<token> endpoint
│       ├── api.js        authenticated management API
│       └── ui.js         static dashboard
├── public/               dashboard (index.html, styles.css, app.js, favicon.svg)
├── test/hookline.test.js
└── data/                 created at runtime, git-ignored
```

## Troubleshooting

**"No endpoint is registered for token …" (404)** — you created the endpoint on a
different machine, or the database folder changed. Check `--data` and that you are
using the current token.

**Dashboard says "unauthorized"** — the token changed. The new one is in the startup
banner; paste it into the unlock screen. Use **Lock** in the header to clear the old
one.

**A request does not show up** — check the endpoint is not **Paused** (paused
endpoints answer `503` and store nothing), that auto-refresh is on, and that you are
sending to the right token.

**`payload_too_large` (413)** — the body exceeds `--max-body` (1 MB by default).
Raise it or trim the payload.

**Nothing works from my phone on the same Wi-Fi** — you are bound to `127.0.0.1`.
Restart with `--host 0.0.0.0` and use your machine's LAN IP.

**Replay fails with `fetch failed`** — the target is not listening. Start your own
server first, or check the URL scheme is `http`/`https`.

## License

MIT — see [LICENSE](LICENSE). Use it in commercial work, modify it, resell it.

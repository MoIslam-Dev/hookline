# SellMyCode listing — HookLine

Everything the submission form asks for, ready to paste. Field names follow the
questions SellMyCode asks an author; adjust the wording if their form differs.

- **Uploaded file:** `dist/hookline-v1.0.0.zip` (built by `MARKETING/build-release.sh`)
- **Never upload the repository folder.** The ZIP excludes your `data/` directory
  (your real captured requests), any `.env`, and this `MARKETING/` folder.

---

## Product title

```
HookLine — Self-Hosted Webhook & API Request Inspector (Node.js, Zero Dependencies)
```

## One-line summary

```
Capture any HTTP request to a unique URL, inspect it, replay it, and copy it as cURL,
JavaScript, Python or raw HTTP. A self-hosted RequestBin / Webhook.site alternative.
```

## Category

Developer Tools → Webhooks / API Testing. If they ask for a secondary category, use
DevOps → Testing & QA.

## Tags / keywords

```
webhook, webhooks, requestbin, webhook.site alternative, request inspector, api
testing, curl generator, self-hosted, nodejs, developer tools, api mock, http
debugging, payload inspector, webhook receiver, integration testing, no dependencies
```

## Price

Set your own. For reference: $29 net lands you roughly $19 after the 35% Starter fee,
and the same $29 on Lemon Squeezy or Gumroad nets about $27. If you want the two to be
competitive rather than identical, $39 here still undercuts most RequestBin-alikes
while leaving room on your own storefront.

## Requirements / "what you need to run this"

```
Node.js 22.5.0 or newer (uses the built-in node:sqlite module — nothing to install)
No database server, no Docker, no npm dependencies
Runs on Linux, macOS and Windows
Takes about 2 MB of RAM when idle
```

Do not list a database server as a requirement. There isn't one.

---

## Full description (paste as-is)

```markdown
You are integrating a webhook. To find out what the provider actually sends you, you
need an HTTPS URL that is publicly reachable. Every option for that is worse than it
should be:

- A hosted request bin needs an account, rate-limits you, and keeps your production
  payloads on somebody else's server.
- ngrok plus a throwaway 40-line server means rewriting that server for every new
  integration.
- A staging server is slow, and it never tells you what your local code would do with
  a payload you have never seen.

HookLine is that throwaway server, made properly. One command gives you a named URL.
Send anything to it and it is captured, stored and displayed — with search, replay and
one-click code generation. No account, no API key, no subscription, and nothing ever
leaves your machine.

QUICK START

    npm start

That is the whole installation — HookLine has zero runtime dependencies. Open the
dashboard, paste the API token from the banner into the unlock screen, create an
endpoint and you have a URL to test against.

    curl -X POST http://127.0.0.1:4000/api/bins \
      -H "x-hookline-token: YOUR_TOKEN" \
      -H "content-type: application/json" \
      -d '{"name":"stripe-events"}'

    curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
      -H "content-type: application/json" \
      -d '{"event":"payment.completed","amount":15000}'

The request appears in the dashboard within three seconds. DEMO.md in the package
reproduces the entire feature set, including the error-path tests.

FEATURES

Capture
- Unlimited endpoints, each with its own URL, shared secret and retention window.
- ANY /h/<token> and every sub-path below it, so one URL can separate several
  integrations.
- JSON, form-encoded, plain text and binary payloads. Binary is stored as base64, so it
  is never corrupted.
- Query string, headers, remote address, body size and response status recorded for
  every request.
- Optional per-endpoint shared secret (x-hookline-secret) for realistic signature
  testing.
- Sensitive query parameters — secret, token, password, access_token, signature,
  api_key, authorization — are redacted before they are stored.

Inspect
- Live dashboard with 3-second auto-refresh, manual refresh, and per-endpoint stats.
- Search across path, headers and body. Filter by method and by response status class
  (1xx-5xx).
- Cursor pagination, so you can scroll back through your whole history.
- Detail drawer with Body, Headers, Query, Code and Replay tabs.
- Pretty-printed JSON, form payloads rendered as a table, binary payloads flagged.

Act
- Replay any captured request to any URL, optionally editing the payload first — the
  fastest way to find out how your own handler reacts to a body it has never seen.
- Copy any request as cURL, fetch, Python requests, Node.js http, or raw HTTP.
- Export an endpoint's history as a JSON file.

TEST YOUR OWN ERROR HANDLING

This is the feature that makes HookLine worth more than a request bin. Response-shaping
headers let HookLine answer with whatever your integration will meet in production:

- x-hookline-status: force a status code, e.g. 500
- x-hookline-delay: wait N ms before responding, to test your timeout handling
- x-hookline-body: return this exact body
- x-hookline-content-type: pair it with a wrong content type

The same values work as query parameters: ?__status=500, ?__delay=8000, ?__body=...

OPERATIONS

- Single-file SQLite database, created automatically, auto-pruned to each endpoint's
  retention window.
- API token required on every management call, compared in constant time.
- Graceful shutdown, --dev request logging, configurable max body size.
- Runs behind nginx or Caddy as a reverse proxy. Use --host 0.0.0.0 and
  --public-url https://your-domain to serve real HTTPS.
- No telemetry, no analytics, no outbound requests. Your payloads stay on your disk.

WHAT IS INCLUDED

- Full source code (src/ — 8 modules, commented where it matters)
- Dashboard front end (public/ — vanilla HTML, CSS and JavaScript, no framework)
- Automated test suite: 45 tests across 9 suites, run with npm test
- README.md — installation, configuration, API reference, reverse-proxy setup
- DEMO.md — the full feature walkthrough used to record the product demo
- CHANGELOG.md
- MIT LICENSE

REQUIREMENTS

- Node.js 22.5.0 or newer (for the built-in node:sqlite module)
- No dependencies to install, no database to provision, no Docker required

A NOTE ON HONESTY

This is a single-operator tool. It stores everything in one SQLite file on your disk
and has no user accounts, because that is the job it does. If you need multi-tenant
access or a hosted shared inbox, you want a service, not this. It is meant for the
moment you are integrating a provider and need to see what it actually sends.

Support is provided through the marketplace message system.
```

---

## Changelog to paste into the version field

The contents of `CHANGELOG.md` — `1.0.0`, first public release. SellMyCode asks for
per-version notes; for 1.0.0 paste the "Added" list from `CHANGELOG.md`.

## Demo link

If they require a live demo URL, you need a public instance. Cheapest reliable options:

- A free VPS or Hetzner/Contabo box: `node src/cli.js --host 0.0.0.0` behind Caddy with
  a real domain and HTTPS.
- Fly.io or Railway, one `Dockerfile`, roughly five minutes of setup.

**Before exposing it publicly:** set your own `HOOKLINE_TOKEN`, put it behind HTTPS,
and know that anyone who finds the dashboard URL still needs that token to do anything.
Rotate the token if it ever leaks.

---

## Pre-submission checklist

SellMyCode reviews for working code that matches the description, accurate
documentation, no third-party infringement, and readable unobfuscated source. All four
are covered — this is the list to tick before you submit:

- [x] The ZIP runs from a clean extract with no `npm install` — verified, 45/45 tests
- [x] `npm start` boots and prints a working dashboard URL and API token
- [x] An endpoint can be created from the UI and from the API
- [x] JSON, form, query-string and binary payloads are captured and rendered
- [x] Secret query parameters are redacted — verified in a live request
- [x] Replay and "copy as" produce valid code
- [x] Forced status, delay and body actually change the response — verified
- [x] README covers install, configuration, API reference and reverse proxying
- [x] CHANGELOG.md present
- [x] MIT LICENSE present, and you are the original author
- [x] No third-party assets, no CDN, no fonts, no icon packs, no obfuscation
- [x] `data/`, `.env` and `MARKETING/` are excluded from the ZIP by the build script
- [x] Screenshots match what the software actually does

## Two things to do before you submit

1. **Screenshots.** The review process explicitly checks descriptions and screenshots
   for accuracy. Capture the real UI: the endpoint list, the detail drawer with the
   Code tab open, the Replay tab, the search-and-filter row, and the forced-500 entry
   in the list. Never mock them up in a design tool.
2. **A video, if the form allows one.** The demo below is under two minutes and is the
   single strongest thing on the page.

   ```
   npm start
   → unlock the dashboard
   → create endpoint "stripe-events"
   → paste the curl block from DEMO.md section 3 four times
   → click the newest request, show Body, then Code, then Replay
   → run the x-hookline-status: 500 example, watch the red 5xx filter catch it
   ```

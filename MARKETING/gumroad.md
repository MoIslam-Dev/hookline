# Gumroad listing — HookLine

Paste-ready. Every field on the Gumroad product form, in order.

| Gumroad field | Value |
|---|---|
| Name | `HookLine` |
| Subtitle (short) | `Self-hosted webhook & request inspector` |
| Price | `29` USD |
| Product file | `dist/hookline-v1.0.0.zip` (60 KB) |
| Version | `1.0.0` |
| Suggested version note | `First public release. 45 tests passing.` |
| Tags | `developer-tools, nodejs, webhooks, api-testing, debugging, self-hosted` |

---

## Settings that matter — check these before you publish

- **Do NOT enable "requires license key".** HookLine has no activation system, so a
  key would gate a download for no reason and produce "my key does not work" emails.
- **File size**: 60 KB, far under the limit. No problem.
- **"Product name in URL"**: `hookline` — keep it simple and typeable.
- **More info URL**: use your GitHub repo if you want one:
  `https://github.com/MoIslam-Dev/hookline`
  (Optional. Your description is strong enough without it. Do not use a localhost URL —
  buyers cannot reach it.)
- **Support email field, if present**: `moislam.djouablia@gmail.com`

---

## Description — paste everything between the lines

```markdown
You are integrating a webhook. To find out what the provider actually sends you, you
need a URL that is publicly reachable. Every option for that is worse than it should be:

- A hosted request bin needs an account, rate-limits you, and keeps your production
  payloads on someone else's server.
- ngrok plus a throwaway 40-line server means rewriting that server for every new
  integration.
- A staging server is slow, and it never tells you what your local code would do with a
  payload you have never seen.

**HookLine is that throwaway server, made properly.** One command gives you a named
URL. Send anything to it and it is captured, stored and displayed — with search, replay
and one-click code generation. No account, no API key, no subscription, and nothing ever
leaves your machine.

## Quick start

```
npm start
```

That is the entire installation — zero runtime dependencies. Open the dashboard, paste
the API token from the banner into the unlock screen, create an endpoint, and you have a
URL to test against.

## What you get

- **Unlimited endpoints**, each with its own URL, shared secret and retention window
- **Any method, any sub-path** — `POST /h/<token>/stripe/charges` is captured separately,
  so one URL can carry several integrations
- **JSON, form-encoded, text and binary** payloads; JSON is pretty-printed and form data
  renders as a table
- **Secret redaction** — `token`, `password`, `secret`, `access_token`, `signature` and
  `api_key` query parameters are redacted before they are written to storage
- **Search and filters** across path, headers and body, by method and by status class
- **Replay** any request to any URL, editing the payload first
- **Copy as code** — cURL, fetch, Python requests, Node.js http, or raw HTTP
- **Export** an endpoint's history as JSON
- **Live dashboard** that refreshes every three seconds

## The feature that makes it worth more than a request bin

HookLine can make its response misbehave on purpose:

- `x-hookline-status: 500` — force an error code
- `x-hookline-delay: 8000` — stall, to test your timeout handling
- `x-hookline-body: <html>maintenance</html>` — return a body you choose
- `x-hookline-content-type` — pair it with the wrong content type

That turns a viewer into a test rig. You can check that your retry logic, timeout
handling and error parsing survive contact with a provider that is failing, slow or
broken — things you otherwise only discover in production.

## How it works

HookLine is a single Node process with a dashboard in your browser. Start it and it opens
or creates one SQLite file, then prints your dashboard URL and an API token; that token
guards every management call.

Create an endpoint and it gets a short random token, giving you a URL like
`http://your-host:4000/h/abc123xyz`. Every HTTP method on that path is accepted, and so is
every sub-path beneath it. Requests are read with a size limit, classified, stored with
their headers and query string, and answered with a capture receipt. The response returned
is the one you choose: a normal acknowledgement by default, or a forced status, delay,
body or content type.

The dashboard polls every three seconds. Open any request to read its headers, query,
formatted body, generated code, or replay it. Requests are deleted automatically once they
pass the endpoint's retention window.

## Use case

You are integrating a payment gateway, a CRM, a shipping service or a CI webhook, and the
documentation does not show the exact payload your plan receives. You need a reachable URL
for a few hours, not a permanent hosted account, and you would rather production payloads
did not sit on someone else's server.

Point the provider at a HookLine endpoint and the real request appears in your dashboard
within seconds: fields, headers, signature and all. Copy it as working code in your
language, replay it against your own handler, and edit the body to try cases the provider
will not send on demand. Then make the endpoint answer with a 500, a timeout or the wrong
content type, and confirm your code copes. Everything stays on your own machine.

## Requirements

- Node.js 22.13.0 or newer (Node 24 LTS recommended), **or** Docker
- No dependencies to install, no database server, no build step
- Linux, macOS or Windows
- Docker optional — a `Dockerfile`, `docker-compose.yml` and `fly.toml` are included

## In the package

- Full readable source (2,700+ lines, not minified, no obfuscation)
- Automated test suite — 45 tests, run with `npm test`
- `README.md` — install, configuration, full API reference, reverse-proxy setup
- `DEMO.md` — the feature walkthrough used to record the demo
- `CHANGELOG.md`
- MIT licence

## An honest note

This is a single-operator tool. Everything lives in one SQLite file on your disk, and
there are no user accounts, because that is the job it does. If you need multi-tenant
access or a shared hosted inbox, you want a service, not this. HookLine is for the moment
you are integrating a provider and need to see what it actually sends.

## Support

Support covers questions and bug reports about the product as delivered, for 30 days from
purchase. It does not include new features, custom development, or integration consulting
on your own codebase. Bug fixes will be released as a new version.

Reply to `moislam.djouablia@gmail.com`.
```

---

## After you publish — do these five things

1. **Buy it yourself once.** Pay with a real card, confirm the ZIP downloads, unzips and
   runs. Then refund yourself. This is the only way to be certain the file works from a
   buyer's side.
2. **Set up payouts before you sell.** Gumroad will not pay you without tax details. If
   you are outside the US this is a W-8BEN form, not a W-9. Check your Gumroad dashboard
   for the payout and tax section.
3. **Read your actual fee.** I have been quoting ~10%, which was the published figure when
   I checked. Your dashboard shows the real number, including payment processing. Set your
   price knowing your true cut.
4. **Post the link somewhere developers are.** A product page with zero traffic sells
   zero. HookLine's audience is on Hacker News, Reddit (r/webdev, r/node, r/devops) and
   specific forums. A short post showing the forced-500 feature outperforms a generic
   "I built a tool" post.
5. **Add a demo video if you can.** Screen-record the `DEMO.md` walkthrough — it is under
   two minutes. Upload to YouTube as unlisted and link it. This is free and it is the
   single biggest conversion lever you have.

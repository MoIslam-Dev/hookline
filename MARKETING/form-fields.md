# SellMyCode form answers — word-count fields

Paste each block into its matching field. Plain paragraphs, no markdown.

---

## Full description (min 200 words — this is 272)

HookLine is a self-hosted webhook and API request inspector. Every integration you are
building gets its own URL, and everything that URL receives is recorded: method, path,
query string, headers, remote address, body, size and response status. You see what the
provider actually sends instead of inferring it from documentation.

Point anything at it — cURL, Postman, a phone, or the provider itself. JSON,
form-encoded, plain text and binary payloads are all captured, with JSON pretty-printed
and form data rendered as a table. Sensitive query parameters such as token, password,
secret, access_token, signature and api_key are redacted before they are written to
storage, so a shared link does not leak credentials.

What separates HookLine from a hosted request bin is the ability to make the response
misbehave on purpose. Response-shaping headers let it answer with a 500, stall for eight
seconds, or return HTML where JSON was expected. That turns a viewer into a test rig:
you can check that your retry logic, timeout handling and error parsing survive contact
with a provider that is failing, slow or broken.

Every captured request can be replayed to any URL with the payload editable first, and
copied as cURL, fetch, Python requests, Node.js http or raw HTTP.

The dashboard refreshes every three seconds, with search across path, headers and body,
filtering by method and status class, and per-endpoint statistics. History lives in one
SQLite file and is pruned automatically to each endpoint's retention window. Nothing
leaves your machine: no telemetry, no user accounts, no external services.

Requires Node.js 22.13 or newer, or Docker. No runtime dependencies, no database server,
no build step. MIT licensed.

---

## How it works (min 100 words — this is 187)

HookLine is a single Node process with a dashboard that opens in your browser.

Start it and it opens or creates one SQLite file, then prints your dashboard URL and an
API token. That token guards every management call, so keep it to yourself.

Create an endpoint and HookLine gives it a short random token, producing a URL like
http://your-host:4000/h/abc123xyz. Every HTTP method on that path is accepted — GET,
POST, PUT, PATCH, DELETE, anything — and so is every sub-path beneath it, so a single
URL can carry several integrations. Incoming requests are read with a size limit,
classified as JSON, form, text or binary, stored with their headers and query string,
and answered with a capture receipt. Secret-looking query parameters are redacted on the
way in. The response returned is the one you choose: a normal acknowledgement by
default, or a forced status, delay, body or content type.

The dashboard polls every three seconds. Open any request to read its headers, query,
formatted body, generated code, or to replay it against any target URL. Requests are
deleted automatically once they pass the endpoint's retention window.

---

## Use case (min 50 words — this is 133)

You are integrating a provider — a payment gateway, a CRM, a shipping service, a CI
webhook — and the documentation does not show the exact payload your plan receives. You
need a reachable URL for a few hours, not a permanent hosted account, and you would
rather production payloads did not sit on someone else's server.

Point the provider at a HookLine endpoint and the real request appears in your dashboard
within seconds: fields, headers, signature and all. Copy it as working code in your
language, replay it against your own handler, and edit the body to try cases the provider
will not send on demand. Then make the endpoint answer with a 500, a timeout or the
wrong content type, and confirm your code copes. Everything stays on your own machine.

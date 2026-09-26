# HookLine demo — reproduce it in 90 seconds

This is the exact flow used to record the product demo. Follow it and you will have
captured, inspected and replayed real requests in under two minutes.

Everything runs on your own machine. No account, no API key, no external service.

---

## 1. Start HookLine

```bash
npm start
```

The banner prints everything you need:

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

Open the dashboard, then paste the **API token** into the unlock screen. It is saved in
your browser's localStorage, so you only do this once. Leave the terminal open — every
command below uses the token shown in the banner.

> The token is generated and stored on first run. To choose your own, start with
> `HOOKLINE_TOKEN=your-token npm start`, or `npm start -- --token your-token`.

---

## 2. Create an endpoint

Every endpoint gets its own URL. Create one from the dashboard (**New endpoint**), or
from the command line — replacing `YOUR_TOKEN` with the token from the banner:

```bash
curl -X POST http://127.0.0.1:4000/api/bins \
  -H "x-hookline-token: YOUR_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"stripe-events","retentionDays":7}'
```

The response contains the capture URL — this is the address a real provider would call:

```json
{
  "ok": true,
  "bin": {
    "id": "3bb2250d-3ff2-4c96-b149-69fa302d8b50",
    "token": "nrs3mehqesys",
    "name": "stripe-events",
    "retentionDays": 7,
    "url": "http://127.0.0.1:4000/h/nrs3mehqesys"
  }
}
```

---

## 3. Send requests to it

**A JSON payload with custom headers** — the way most webhooks arrive:

```bash
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 12345" \
  -H "X-Environment: development" \
  -H "Authorization: Bearer test-token-123" \
  -d '{"event":"payment.completed","paymentId":"PAY-2026-001","amount":15000,"currency":"EUR"}'
```

**A nested object, to show the JSON pretty-printer:**

```bash
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "Content-Type: application/json" \
  -d '{"user":{"id":42,"name":"Mohamed","email":"mohamed@example.com"},"action":"login"}'
```

**An array of items, to show it is not just flat objects:**

```bash
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "Content-Type: application/json" \
  -d '{"event":"order.created","orderId":"ORD-12345","items":[{"product":"Keyboard","quantity":1,"price":8500},{"product":"Mouse","quantity":2,"price":2500}],"total":13500}'
```

**A GET with a query string** — watch the secrets get redacted:

```bash
curl "http://127.0.0.1:4000/h/nrs3mehqesys?user=Mohamed&access_token=should-be-redacted"
```

**A form submission** — rendered as a table instead of raw text:

```bash
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=mohamed@example.com&plan=pro&quantity=3"
```

**A request your provider would reject** — proves the error path too:

```bash
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "x-hookline-status: 422" \
  -d '{"invalid":true}'
```

Each of these returns a capture receipt, and each appears in the dashboard within 3
seconds:

```json
{"ok":true,"requestId":13,"receivedAt":"2026-09-26T12:40:36.746Z"}
```

---

## 4. Inspect it in the dashboard

- The new request is at the top of the list — click it to open the detail drawer.
- Tabs: **Body**, **Headers**, **Query**, **Code**, **Replay**.
- The Body tab pretty-prints JSON, turns form payloads into a table, and flags binary.
- **Code** gives you the request as cURL, `fetch`, Python, Node or raw HTTP — copy it
  straight into your own code to reproduce the call.
- **Replay** sends the request again, optionally after you edit the payload. This is
  the fastest way to find out how your own handler reacts to a body you have never
  seen.

Try the filters too: search across path, headers and body, and filter by method or by
status class (`2xx`, `4xx`, `5xx`).

---

## 5. Things worth trying

**Make HookLine misbehave, on purpose.** These headers change what HookLine *returns*,
so you can test how your integration handles production behaviour:

```bash
# your provider returns an error
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys -H "x-hookline-status: 500" -d '{}'

# your provider is slow — does your code time out?
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys -H "x-hookline-delay: 8000" -d '{}'

# your provider returns HTML instead of JSON
curl -X POST http://127.0.0.1:4000/h/nrs3mehqesys \
  -H "x-hookline-body: <html>maintenance</html>" \
  -H "x-hookline-content-type: text/html" -d '{}'
```

The same values work as query parameters: `?__status=500`, `?__delay=8000`.

**Sign a request.** Give an endpoint a shared secret and HookLine will only accept
requests carrying the matching `x-hookline-secret` header — the realistic case.

**Use any sub-path.** `POST /h/nrs3mehqesys/stripe/charges` is captured separately, so
one URL can separate several integrations.

**Pause and clear.** From the dashboard, or:

```bash
curl -X POST   http://127.0.0.1:4000/api/bins/BIN_ID/clear -H "x-hookline-token: YOUR_TOKEN"
curl -X PATCH  http://127.0.0.1:4000/api/bins/BIN_ID -H "x-hookline-token: YOUR_TOKEN" \
  -H "content-type: application/json" -d '{"isPaused":true}'
```

A paused endpoint returns `503` without recording anything.

---

## Running the tests

```bash
npm test
```

45 tests across 9 suites, no dependencies, nothing to install first.

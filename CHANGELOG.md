# Changelog

All notable changes to HookLine are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/).

## [1.0.0] — 2026-09-26

First public release.

### Added

**Capture**
- Unlimited endpoints, each with its own URL, shared secret and retention window.
- `ANY /h/:token` and every sub-path below it, so one URL can separate several
  integrations.
- JSON, form-encoded, plain text and binary payloads (binary stored as base64, never
  corrupted).
- Query string, headers, remote address, body size and response status recorded for
  every request.
- Optional per-endpoint shared secret (`x-hookline-secret`) for realistic signature
  testing.
- Sensitive query parameters (`secret`, `token`, `password`, `access_token`,
  `signature`, `api_key`, `authorization`) redacted before storage.
- Response-shaping headers `x-hookline-status`, `x-hookline-delay`, `x-hookline-body`
  and `x-hookline-content-type`, also available as `?__status=`, `?__delay=`,
  `?__body=`, for testing how your own code behaves in production.

**Inspect**
- Live dashboard with 3-second auto-refresh, manual refresh and per-endpoint statistics.
- Search across path, headers and body; filter by method and by response status class
  (`1xx`–`5xx`).
- Cursor pagination for scrolling back through history.
- Detail drawer with Body, Headers, Query, Code and Replay tabs.
- Pretty-printed JSON, form payloads rendered as a table, binary payloads flagged.

**Act**
- Replay any captured request to any URL, optionally editing the payload first.
- Copy as cURL, `fetch`, Python `requests`, Node.js `http` or raw HTTP.
- Export an endpoint's history as a JSON file.

**Operations**
- Single-file SQLite database (`node:sqlite`), auto-pruned to each endpoint's
  retention window.
- API token required on every management call, compared in constant time.
- Graceful shutdown, request log with `--dev`, configurable body-size limit.
- Zero runtime dependencies.

[1.0.0]: https://github.com/MoIslam-Dev/hookline/releases/tag/v1.0.0

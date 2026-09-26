import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { buildConfig, parseArgs } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createServer } from '../src/server.js';
import { Store } from '../src/store.js';

let server;
let baseUrl;
let store;
let dataDir;
let config;

const fixtures = {
  bin: null,
  guarded: null,
  filterBin: null,
  replay: { bin: null, requestId: null, received: [], originUrl: null, origin: null },
};

async function startServer(overrides = {}) {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookline-test-'));
  config = buildConfig({
    options: { port: '0', host: '127.0.0.1', data: dataDir, token: 'test-token', ...overrides },
    env: {},
  });
  const db = openDatabase(config.databaseFile);
  store = new Store(db);
  server = createServer({ store, config, apiToken: config.token });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

function api(pathname, { method = 'GET', body, token = 'test-token', headers = {} } = {}) {
  return fetch(`${baseUrl}/api${pathname}`, {
    method,
    headers: {
      'x-hookline-token': token,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  await startServer();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('configuration', () => {
  it('parses short flags, long flags and inline values', () => {
    const { options } = parseArgs(['-p', '8080', '--host=0.0.0.0', '--retention', '30', '--dev']);
    assert.equal(options.port, 8080);
    assert.equal(options.host, '0.0.0.0');
    assert.equal(options.retention, 30);
    assert.equal(options.dev, true);
  });

  it('rejects a numeric option without a value', () => {
    assert.throws(() => parseArgs(['--port']), /requires a value/);
  });

  it('applies precedence CLI > env > default', () => {
    const fromCli = buildConfig({ options: { port: '5000' }, env: { PORT: '6000' } });
    const fromEnv = buildConfig({ options: {}, env: { PORT: '6000' } });
    const fallback = buildConfig({ options: {}, env: {} });
    assert.equal(fromCli.port, 5000);
    assert.equal(fromEnv.port, 6000);
    assert.equal(fallback.port, 4000);
    assert.equal(fallback.host, '127.0.0.1');
  });
});

describe('authentication', () => {
  it('rejects API calls without a token', async () => {
    const response = await fetch(`${baseUrl}/api/bins`);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error, 'unauthorized');
  });

  it('rejects an incorrect token', async () => {
    const response = await api('/bins', { token: 'nope' });
    assert.equal(response.status, 401);
  });

  it('accepts a bearer token', async () => {
    const response = await fetch(`${baseUrl}/api/session`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.ok(payload.version);
  });

  it('exposes an unauthenticated health check', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.service, 'hookline');
  });
});

describe('endpoints (bins)', () => {
  const bin = { get id() { return fixtures.bin.id; }, get token() { return fixtures.bin.token; }, get isPaused() { return fixtures.bin.isPaused; } };

  it('creates an endpoint with a generated token', async () => {
    const response = await api('/bins', { method: 'POST', body: { name: 'Stripe webhooks' } });
    assert.equal(response.status, 201);
    fixtures.bin = (await response.json()).bin;
    assert.equal(fixtures.bin.name, 'Stripe webhooks');
    assert.match(fixtures.bin.token, /^[a-z0-9]{12}$/);
    assert.ok(fixtures.bin.url.endsWith(`/h/${fixtures.bin.token}`));
    assert.equal(fixtures.bin.isPaused, false);
  });

  it('lists endpoints with request counts', async () => {
    const response = await api('/bins');
    const payload = await response.json();
    assert.equal(payload.bins.length, 1);
    assert.equal(payload.bins[0].requestCount, 0);
  });

  it('validates the endpoint name', async () => {
    const response = await api('/bins', { method: 'POST', body: { name: '   ' } });
    assert.equal(response.status, 400);
  });

  it('rejects a too-short secret', async () => {
    const response = await api('/bins', { method: 'POST', body: { name: 'Bad', secret: 'abc' } });
    assert.equal(response.status, 400);
  });

  it('generates a secret on request', async () => {
    const response = await api('/bins', { method: 'POST', body: { name: 'Guarded', generateSecret: true } });
    const payload = await response.json();
    assert.match(payload.bin.secret, /^whsec_[a-z0-9]{24}$/);
    const removal = await api(`/bins/${payload.bin.id}`, { method: 'DELETE' });
    assert.equal(removal.status, 200);
  });

  it('pauses and resumes an endpoint', async () => {
    const paused = await (await api(`/bins/${bin.id}`, { method: 'PATCH', body: { isPaused: true } })).json();
    assert.equal(paused.bin.isPaused, true);
    fixtures.bin = paused.bin;
    const capture = await fetch(`${baseUrl}/h/${bin.token}`, { method: 'POST', body: 'hello' });
    assert.equal(capture.status, 503);
    const resumed = await (await api(`/bins/${bin.id}`, { method: 'PATCH', body: { isPaused: false } })).json();
    assert.equal(resumed.bin.isPaused, false);
    fixtures.bin = resumed.bin;
  });
});

describe('capturing requests', () => {
  const bin = { get id() { return fixtures.bin.id; }, get token() { return fixtures.bin.token; } };

  it('captures a JSON POST and returns an acknowledgement', async () => {
    const response = await fetch(`${baseUrl}/h/${bin.token}/charges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo': 'stripe' },
      body: JSON.stringify({ id: 'evt_1', amount: 2000, nested: { ok: true } }),
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-hookline-request-id'));
    const ack = await response.json();
    assert.equal(ack.ok, true);
    assert.ok(Number.isInteger(ack.requestId));
  });

  it('exposes the stored request with query, headers, body and snippets', async () => {
    const list = await (await api(`/bins/${bin.id}/requests`)).json();
    assert.equal(list.requests.length, 1);
    const id = list.requests[0].id;

    const detail = await (await api(`/requests/${id}`)).json();
    const request = detail.request;
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/charges');
    assert.equal(request.headers['x-demo'], 'stripe');
    assert.deepEqual(request.body.json, { id: 'evt_1', amount: 2000, nested: { ok: true } });
    assert.ok(request.snippets.curl.includes('curl -X POST'));
    assert.ok(request.snippets.curl.includes('--data-raw'));
    assert.ok(request.snippets.python.includes('import requests'));
    assert.ok(request.snippets.javascript.includes('await fetch'));
    assert.ok(request.snippets.http.startsWith('POST /h/'));
  });

  it('captures a form-encoded body', async () => {
    const response = await fetch(`${baseUrl}/h/${bin.token}/form?plan=pro`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=dev%40example.com&plan=pro',
    });
    assert.equal(response.status, 200);
    const id = Number(response.headers.get('x-hookline-request-id'));
    const { request } = await (await api(`/requests/${id}`)).json();
    assert.deepEqual(request.body.form, { email: 'dev@example.com', plan: 'pro' });
    assert.deepEqual(request.query, { plan: 'pro' });
  });

  it('stores binary payloads as base64 without corrupting them', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    const response = await fetch(`${baseUrl}/h/${bin.token}/upload`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    });
    const id = Number(response.headers.get('x-hookline-request-id'));
    const { request } = await (await api(`/requests/${id}`)).json();
    assert.equal(request.body.binary, true);
    assert.equal(request.body.encoding, 'base64');
    assert.equal(Buffer.from(request.body.text, 'base64').equals(bytes), true);
  });

  it('redacts secret-looking query parameters', async () => {
    const response = await fetch(`${baseUrl}/h/${bin.token}/oauth?access_token=supersecretvalue&ok=1`);
    const id = Number(response.headers.get('x-hookline-request-id'));
    const { request } = await (await api(`/requests/${id}`)).json();
    assert.equal(request.query.access_token, '[redacted]');
    assert.equal(request.query.ok, '1');
  });

  it('honours the response-shaping headers', async () => {
    const response = await fetch(`${baseUrl}/h/${bin.token}/failure`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hookline-status': '402',
        'x-hookline-body': 'Payment required',
        'x-hookline-content-type': 'text/plain',
      },
      body: '{"charge":"declined"}',
    });
    assert.equal(response.status, 402);
    assert.equal(await response.text(), 'Payment required');

    const id = Number(response.headers.get('x-hookline-request-id'));
    const { request } = await (await api(`/requests/${id}`)).json();
    assert.equal(request.responseStatus, 402);
    assert.match(request.responseNote, /status → 402/);
  });

  it('applies a response delay', async () => {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/h/${bin.token}/slow`, {
      method: 'GET',
      headers: { 'x-hookline-delay': '120' },
    });
    assert.equal(response.status, 200);
    assert.ok(Date.now() - startedAt >= 115);
  });

  it('returns 404 for an unknown token', async () => {
    const response = await fetch(`${baseUrl}/h/doesnotexistatall`, { method: 'POST' });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'unknown_endpoint');
  });

  it('rejects bodies over the configured limit', async () => {
    const response = await fetch(`${baseUrl}/h/${bin.token}/big`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(2 * 1024 * 1024),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'payload_too_large');
  });
});

describe('secret-protected endpoints', () => {
  const guarded = { get token() { return fixtures.guarded.token; } };

  it('creates a guarded endpoint', async () => {
    const response = await api('/bins', {
      method: 'POST',
      body: { name: 'Partner API', secret: 'super-secret-value' },
    });
    fixtures.guarded = (await response.json()).bin;
    assert.equal(fixtures.guarded.secret, 'super-secret-value');
  });

  it('rejects a request without the secret', async () => {
    const response = await fetch(`${baseUrl}/h/${guarded.token}`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
  });

  it('rejects a request with the wrong secret', async () => {
    const response = await fetch(`${baseUrl}/h/${guarded.token}`, {
      method: 'POST',
      headers: { 'x-hookline-secret': 'wrong' },
      body: '{}',
    });
    assert.equal(response.status, 401);
  });

  it('accepts the correct secret in a header', async () => {
    const response = await fetch(`${baseUrl}/h/${guarded.token}`, {
      method: 'POST',
      headers: { 'x-hookline-secret': 'super-secret-value' },
      body: '{}',
    });
    assert.equal(response.status, 200);
  });
});

describe('filtering, search and pagination', () => {
  const target = { get id() { return fixtures.filterBin.id; }, get token() { return fixtures.filterBin.token; } };
  const targetId = () => fixtures.filterBin.id;

  before(async () => {
    const response = await api('/bins', { method: 'POST', body: { name: 'Filtering' } });
    fixtures.filterBin = (await response.json()).bin;
    for (let i = 0; i < 5; i += 1) {
      const method = i % 2 === 0 ? 'GET' : 'POST';
      await fetch(`${baseUrl}/h/${target.token}/orders/${i}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({ index: i, marker: i === 3 ? 'needle' : 'haystack' }),
      });
    }
  });

  it('filters by method', async () => {
    const { requests } = await (await api(`/bins/${targetId()}/requests?method=POST`)).json();
    assert.equal(requests.length, 2);
    assert.ok(requests.every((item) => item.method === 'POST'));
  });

  it('searches the body', async () => {
    const { requests } = await (await api(`/bins/${targetId()}/requests?search=needle`)).json();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, '/orders/3');
  });

  it('filters by response status class', async () => {
    const { requests } = await (await api(`/bins/${targetId()}/requests?status=200`)).json();
    assert.equal(requests.length, 5);
  });

  it('filters by 2xx/3xx/4xx/5xx class, not as an exact code', async () => {
    const two = await (await api(`/bins/${targetId()}/requests?status=2xx`)).json();
    assert.equal(two.requests.length, 5);
    assert.ok(two.requests.every((item) => item.responseStatus >= 200 && item.responseStatus < 300));

    for (const className of ['3xx', '4xx', '5xx']) {
      const empty = await (await api(`/bins/${targetId()}/requests?status=${className}`)).json();
      assert.equal(empty.requests.length, 0, `${className} should be empty`);
    }

    const errors = await (await api(`/bins/${targetId()}/requests?status=error`)).json();
    assert.equal(errors.requests.length, 0);
  });

  it('paginates with the before cursor', async () => {
    const first = await (await api(`/bins/${targetId()}/requests?limit=2`)).json();
    assert.equal(first.requests.length, 2);
    assert.equal(first.hasMore, true);
    const second = await (
      await api(`/bins/${targetId()}/requests?limit=2&before=${first.nextBefore}`)
    ).json();
    assert.equal(second.requests.length, 2);
    assert.ok(second.requests[0].id < first.requests[1].id);
  });

  it('reports statistics', async () => {
    const { stats } = await (await api(`/stats?binId=${targetId()}`)).json();
    assert.equal(stats.total, 5);
    assert.equal(stats.errors, 0);
  });
});

describe('replay', () => {
  const { received } = fixtures.replay;
  const originUrl = () => fixtures.replay.originUrl;
  const requestId = () => fixtures.replay.requestId;

  before(async () => {
    const http = await import('node:http');
    const origin = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise((resolve) => origin.listen(0, '127.0.0.1', resolve));
    fixtures.replay.origin = origin;
    fixtures.replay.originUrl = `http://127.0.0.1:${origin.address().port}`;

    const created = await (await api('/bins', { method: 'POST', body: { name: 'Replay source' } })).json();
    fixtures.replay.bin = created.bin;

    const capture = await fetch(`${baseUrl}/h/${created.bin.token}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': 't=1,v1=abc' },
      body: JSON.stringify({ type: 'invoice.paid' }),
    });
    fixtures.replay.requestId = Number(capture.headers.get('x-hookline-request-id'));
  });

  after(async () => {
    await new Promise((resolve) => fixtures.replay.origin.close(resolve));
  });

  it('sends the stored payload to the target URL', async () => {
    const payload = await (
      await api(`/requests/${requestId()}/replay`, {
        method: 'POST',
        body: { url: `${originUrl()}/webhooks/stripe` },
      })
    ).json();
    assert.equal(payload.replay.ok, true);
    assert.equal(payload.replay.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'POST');
    assert.equal(received[0].url, '/webhooks/stripe');
    assert.deepEqual(JSON.parse(received[0].body), { type: 'invoice.paid' });
  });

  it('lets the caller override the body', async () => {
    const payload = await (
      await api(`/requests/${requestId()}/replay`, {
        method: 'POST',
        body: { url: `${originUrl()}/edited`, body: JSON.stringify({ type: 'invoice.failed' }) },
      })
    ).json();
    assert.equal(payload.replay.ok, true);
    assert.deepEqual(JSON.parse(received[1].body), { type: 'invoice.failed' });
  });

  it('rejects a non-HTTP target', async () => {
    const response = await api(`/requests/${requestId()}/replay`, {
      method: 'POST',
      body: { url: 'file:///etc/passwd' },
    });
    assert.equal(response.status, 400);
  });

  it('reports a connection failure instead of crashing', async () => {
    const payload = await (
      await api(`/requests/${requestId()}/replay`, {
        method: 'POST',
        body: { url: 'http://127.0.0.1:1/nothing-here', timeoutMs: 1000 },
      })
    ).json();
    assert.equal(payload.replay.ok, false);
    assert.ok(payload.replay.error);
  });

  it('links a replayed capture back to the original request', async () => {
    const payload = await (
      await api(`/requests/${requestId()}/replay`, {
        method: 'POST',
        body: { url: `${baseUrl}/h/${fixtures.replay.bin.token}/webhooks/stripe` },
      })
    ).json();
    assert.equal(payload.replay.ok, true);
    assert.ok(payload.replay.capturedAs);
    const { request } = await (await api(`/requests/${payload.replay.capturedAs}`)).json();
    assert.equal(request.replayOf, requestId());
  });
});

describe('maintenance', () => {
  it('clears stored requests without deleting the endpoint', async () => {
    const created = await api('/bins', { method: 'POST', body: { name: 'Temporary' } });
    const temp = (await created.json()).bin;
    await fetch(`${baseUrl}/h/${temp.token}/x`, { method: 'POST', body: 'a' });
    await fetch(`${baseUrl}/h/${temp.token}/y`, { method: 'POST', body: 'b' });

    const cleared = await (await api(`/bins/${temp.id}/clear`, { method: 'POST' })).json();
    assert.equal(cleared.removed, 2);
    const after = await (await api(`/bins/${temp.id}/requests`)).json();
    assert.equal(after.requests.length, 0);
  });

  it('deletes an endpoint and its requests', async () => {
    const created = await api('/bins', { method: 'POST', body: { name: 'Doomed' } });
    const doomed = (await created.json()).bin;
    await fetch(`${baseUrl}/h/${doomed.token}/x`, { method: 'POST', body: 'a' });
    const deleted = await api(`/bins/${doomed.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    const gone = await api(`/bins/${doomed.id}`);
    assert.equal(gone.status, 404);
  });

  it('exports an endpoint as JSON', async () => {
    const created = await api('/bins', { method: 'POST', body: { name: 'Exporter' } });
    const exported = (await created.json()).bin;
    await fetch(`${baseUrl}/h/${exported.token}/export-me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
    const response = await api(`/bins/${exported.id}/export`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment/);
    const dump = await response.json();
    assert.equal(dump.requests.length, 1);
    assert.equal(dump.requests[0].path, '/export-me');
  });

  it('prunes requests past the retention window', async () => {
    const created = await api('/bins', { method: 'POST', body: { name: 'Old', retentionDays: 1 } });
    const old = (await created.json()).bin;
    await fetch(`${baseUrl}/h/${old.token}/ancient`, { method: 'POST', body: 'old' });

    const bin = store.getBin(old.id);
    store.db.prepare('UPDATE requests SET received_at = ? WHERE bin_id = ?').run(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
      bin.id,
    );

    const removed = store.pruneExpired();
    assert.ok(removed >= 1);
    const after = await (await api(`/bins/${old.id}/requests`)).json();
    assert.equal(after.requests.length, 0);
  });
});

describe('dashboard assets', () => {
  it('serves the dashboard at /', async () => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('HookLine'));
    assert.ok(html.includes('/app.js'));
  });

  it('serves the stylesheet and script', async () => {
    const css = await fetch(`${baseUrl}/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    const js = await fetch(`${baseUrl}/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  });

  it('refuses path traversal', async () => {
    const response = await fetch(`${baseUrl}/../package.json`, { redirect: 'manual' });
    assert.notEqual(response.status, 200);
  });

  it('returns 404 for a missing asset', async () => {
    const response = await fetch(`${baseUrl}/nope.js`);
    assert.equal(response.status, 404);
  });
});

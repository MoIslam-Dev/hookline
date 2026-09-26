import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

import { describeBody, readJsonBody } from '../lib/body.js';
import { buildCodeSnippets } from '../lib/format.js';
import { safeEqual, sendError, sendJson } from '../lib/http.js';
import { performReplay } from '../lib/replay.js';

const MAX_NAME_LENGTH = 80;

function isAuthorized(req, url, token) {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return safeEqual(auth.slice(7).trim(), token);
  }
  const header = req.headers['x-hookline-token'];
  if (typeof header === 'string' && header.length > 0) return safeEqual(header, token);
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return safeEqual(fromQuery, token);
  return false;
}

/** Sends an error and returns true so callers can `return fail(...)`. */
function fail(res, statusCode, code, message) {
  sendError(res, statusCode, code, message);
  return true;
}

function endpointUrl(config, bin, path = '/', query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  }
  const qs = search.toString();
  const suffix = path === '/' ? '' : path;
  return `${config.publicUrl}/h/${bin.token}${suffix}${qs ? `?${qs}` : ''}`;
}

function serializeSummary(item, config, bin) {
  return { ...item, url: endpointUrl(config, bin, item.path, item.query) };
}

function serializeRequest(full, config, bin) {
  const described = describeBody(full.body, full.contentType ?? '');
  const url = endpointUrl(config, bin, full.path, full.query);
  return {
    id: full.id,
    binId: full.binId,
    binName: bin?.name ?? null,
    endpointToken: bin?.token ?? null,
    receivedAt: full.receivedAt,
    method: full.method,
    path: full.path,
    url,
    query: full.query,
    headers: full.headers,
    contentType: full.contentType,
    remoteAddr: full.remoteAddr,
    responseStatus: full.responseStatus,
    responseMs: full.responseMs,
    responseNote: full.responseNote,
    replayOf: full.replayOf,
    body: described,
    snippets: buildCodeSnippets({
      method: full.method,
      url,
      headers: full.headers,
      body: described.binary ? null : described.text,
    }),
  };
}

function isValidName(value) {
  const name = String(value ?? '').trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH;
}

function isValidSecret(value) {
  const secret = String(value).trim();
  return secret.length >= 8 && secret.length <= 128;
}

function newSecret() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = 'whsec_';
  for (const byte of randomBytes(24)) out += alphabet[byte % alphabet.length];
  return out;
}

/**
 * Handles every /api route. Returns true when the request was an API request
 * (handled either way, including auth failures).
 */
export async function handleApi(req, res, ctx) {
  const { store, config, url, pathname, method } = ctx;
  const apiToken = ctx.apiToken ?? store.ensureToken();
  const segments = pathname.split('/').filter(Boolean);
  const [, resource, ...rest] = segments;

  if (pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'hookline',
      version: config.version,
      uptimeSeconds: Math.round(process.uptime()),
    });
    return true;
  }

  if (!isAuthorized(req, url, apiToken)) {
    return fail(
      res,
      401,
      'unauthorized',
      'Missing or invalid API token. Send it as the x-hookline-token header, an Authorization: Bearer header, or ?token=.',
    );
  }

  if (pathname === '/api/session' && method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      version: config.version,
      publicUrl: config.publicUrl,
      maxBodyBytes: config.maxBodyBytes,
      defaultRetentionDays: config.retentionDays,
    });
    return true;
  }

  if (resource === 'stats' && method === 'GET') {
    const binId = url.searchParams.get('binId');
    if (binId && !store.getBin(binId)) return fail(res, 404, 'not_found', 'Endpoint not found.');
    sendJson(res, 200, { ok: true, stats: store.stats(binId) });
    return true;
  }

  if (resource === 'bins') {
    if (rest.length === 0) {
      if (method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          bins: store.listBins().map((bin) => ({ ...bin, url: endpointUrl(config, bin, '/', {}) })),
        });
        return true;
      }
      if (method === 'POST') {
        const body = await readJson(req, res, config);
        if (body === null) return true;
        if (body.name !== undefined && !isValidName(body.name)) {
          return fail(res, 400, 'bad_request', `Name must be 1-${MAX_NAME_LENGTH} characters.`);
        }
        if (body.secret && !isValidSecret(body.secret)) {
          return fail(res, 400, 'bad_request', 'Secret must be between 8 and 128 characters.');
        }
        const secret = body.generateSecret ? newSecret() : body.secret ? String(body.secret).trim() : null;
        const retentionDays = body.retentionDays
          ? Math.min(365, Math.max(1, Math.trunc(Number(body.retentionDays))))
          : config.retentionDays;
        const bin = store.createBin({
          name: String(body.name ?? '').trim() || 'Untitled endpoint',
          secret,
          retentionDays,
        });
        sendJson(res, 201, { ok: true, bin: { ...bin, url: endpointUrl(config, bin, '/', {}) } });
        return true;
      }
      return fail(res, 405, 'method_not_allowed', `${method} is not supported on /api/bins.`);
    }

    const bin = store.getBin(rest[0]);
    if (!bin) return fail(res, 404, 'not_found', 'Endpoint not found.');
    const sub = rest[1];

    if (sub === undefined) {
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, bin: { ...bin, url: endpointUrl(config, bin, '/', {}) } });
        return true;
      }
      if (method === 'PATCH') {
        const body = await readJson(req, res, config);
        if (body === null) return true;
        if (body.name !== undefined && !isValidName(body.name)) {
          return fail(res, 400, 'bad_request', `Name must be 1-${MAX_NAME_LENGTH} characters.`);
        }
        if (body.secret !== undefined && body.secret !== null && !isValidSecret(body.secret)) {
          return fail(res, 400, 'bad_request', 'Secret must be between 8 and 128 characters.');
        }
        const updated = store.updateBin(bin.id, body);
        sendJson(res, 200, { ok: true, bin: { ...updated, url: endpointUrl(config, updated, '/', {}) } });
        return true;
      }
      if (method === 'DELETE') {
        store.deleteBin(bin.id);
        sendJson(res, 200, { ok: true, deleted: true });
        return true;
      }
      return fail(res, 405, 'method_not_allowed', `${method} is not supported on /api/bins/:id.`);
    }

    if (sub === 'clear' && method === 'POST') {
      sendJson(res, 200, { ok: true, removed: store.clearBin(bin.id) });
      return true;
    }

    if (sub === 'requests' && method === 'GET') {
      const { items, hasMore } = store.listRequests(bin.id, {
        search: url.searchParams.get('search') ?? '',
        method: url.searchParams.get('method') ?? '',
        status: url.searchParams.get('status') ?? '',
        limit: url.searchParams.get('limit') ?? 50,
        before: url.searchParams.get('before'),
      });
      sendJson(res, 200, {
        ok: true,
        requests: items.map((item) => serializeSummary(item, config, bin)),
        hasMore,
        nextBefore: hasMore ? items[items.length - 1].receivedAt : null,
      });
      return true;
    }

    if (sub === 'export' && method === 'GET') {
      const dump = store.exportBin(bin.id);
      dump.endpoint.url = endpointUrl(config, bin, '/', {});
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="hookline-${bin.token}.json"`,
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(dump, null, 2));
      return true;
    }

    return fail(res, 404, 'not_found', 'Unknown endpoint resource.');
  }

  if (resource === 'requests' && rest.length >= 1) {
    const requestId = Number(rest[0]);
    const full = Number.isFinite(requestId) ? store.getRequest(requestId) : null;
    if (!full) return fail(res, 404, 'not_found', 'Request not found.');
    const bin = store.getBin(full.binId);

    if (rest[1] === undefined && method === 'GET') {
      sendJson(res, 200, { ok: true, request: serializeRequest(full, config, bin) });
      return true;
    }

    if (rest[1] === 'replay' && method === 'POST') {
      const body = (await readJson(req, res, config)) ?? {};
      const target = String(body.url ?? '').trim() || endpointUrl(config, bin, full.path, full.query);
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        return fail(res, 400, 'bad_request', 'The replay target must be a valid absolute URL.');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return fail(res, 400, 'bad_request', 'Only http:// and https:// replay targets are supported.');
      }

      const originalText = full.body ? full.body.toString('utf8') : '';
      const result = await performReplay({
        method: body.method ? String(body.method).toUpperCase() : full.method,
        url: parsed.toString(),
        headers: { ...full.headers, ...(body.headers ?? {}) },
        body: body.body === undefined ? originalText : String(body.body),
        timeoutMs: body.timeoutMs ? Math.min(60_000, Math.max(500, Number(body.timeoutMs))) : 15_000,
      });

      let capturedAs = null;
      if (result.ok && result.requestId) {
        const newId = Number(result.requestId);
        if (Number.isFinite(newId) && store.getRequest(newId)) {
          store.linkReplay(newId, full.id);
          capturedAs = newId;
        }
      }
      sendJson(res, 200, { ok: true, replay: { ...result, target: parsed.toString(), capturedAs } });
      return true;
    }

    return fail(res, 404, 'not_found', 'Unknown request resource.');
  }

  return fail(res, 404, 'not_found', `Unknown API route: ${method} ${pathname}`);
}

/** Reads a JSON body, answering the request itself on failure. */
async function readJson(req, res, config) {
  try {
    return await readJsonBody(req, 128 * 1024);
  } catch (error) {
    fail(res, error.statusCode ?? 400, 'bad_request', error.message);
    return null;
  }
}

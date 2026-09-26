import { Buffer } from 'node:buffer';

import { PayloadTooLargeError, describeBody, normalizeHeaders, readRawBody } from '../lib/body.js';
import { clientIp, safeEqual, sendJson } from '../lib/http.js';

const MAX_DELAY_MS = 30_000;

const SENSITIVE_QUERY_KEYS = /(secret|token|password|passwd|signature|api[-_]?key|authorization)/i;
const REDACTED = '[redacted]';

function intFrom(value, { min, max }) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function collectQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    if (SENSITIVE_QUERY_KEYS.test(key)) {
      query[key] = REDACTED;
    } else if (Object.prototype.hasOwnProperty.call(query, key)) {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    } else {
      query[key] = value;
    }
  }
  return query;
}


function headerValue(headers, name) {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The public capture endpoint: `ANY /h/:token` and everything below it.
 *
 * Response-shaping headers (useful for testing how your own code reacts):
 *   x-hookline-status       force a status code, e.g. 404
 *   x-hookline-delay        wait N ms before responding
 *   x-hookline-body         return this exact body
 *   x-hookline-content-type content type for the forced body
 * The same values can be passed as `?__status=`, `?__delay=`, `?__body=`.
 */
export async function handleCapture(req, res, { store, config, token, subPath, url }) {
  const bin = store.getBinByToken(token);
  if (!bin) {
    sendJson(res, 404, {
      error: 'unknown_endpoint',
      message: `No endpoint is registered for token "${token}". Create it in the HookLine dashboard first.`,
    });
    return;
  }

  if (bin.isPaused) {
    sendJson(res, 503, {
      error: 'endpoint_paused',
      message: `"${bin.name}" is paused. Resume it from the dashboard to keep receiving requests.`,
    });
    return;
  }

  const headers = normalizeHeaders(req.headers);
  const query = collectQuery(url.searchParams);
  const control = {
    __status: url.searchParams.get('__status'),
    __delay: url.searchParams.get('__delay'),
    __body: url.searchParams.get('__body'),
    __type: url.searchParams.get('__type'),
  };

  if (bin.secret) {
    const provided =
      headerValue(headers, 'x-hookline-secret') ?? control.__secret ?? url.searchParams.get('secret');
    if (!safeEqual(provided, bin.secret)) {
      sendJson(res, 401, {
        error: 'invalid_secret',
        message: 'This endpoint requires a secret. Send it as the x-hookline-secret header or ?secret= value.',
      });
      return;
    }
  }

  let raw;
  try {
    raw = await readRawBody(req, config.maxBodyBytes);
  } catch (error) {
    if (error.statusCode === 413) {
      sendJson(res, 413, {
        error: 'payload_too_large',
        message: `Request body exceeds the ${config.maxBodyBytes} byte limit. Restart HookLine with --max-body to raise it.`,
      });
      return;
    }
    throw error;
  }

  const contentType = headerValue(headers, 'content-type') ?? null;
  const described = describeBody(raw, contentType ?? '');

  const overrideStatus =
    intFrom(headerValue(headers, 'x-hookline-status') ?? control.__status, { min: 100, max: 599 }) ?? 200;
  const overrideDelay =
    intFrom(headerValue(headers, 'x-hookline-delay') ?? control.__delay, { min: 0, max: MAX_DELAY_MS }) ?? 0;
  const overrideBody = headerValue(headers, 'x-hookline-body') ?? control.__body ?? null;
  const overrideContentType =
    headerValue(headers, 'x-hookline-content-type') ?? control.__type ?? null;

  const receivedAt = Date.now();
  const startedAt = performance.now();

  if (overrideDelay > 0) await sleep(overrideDelay);

  const requestId = store.recordRequest({
    binId: bin.id,
    receivedAt,
    method: req.method,
    path: subPath,
    query,
    headers,
    body: raw.length > 0 ? raw : null,
    bodyEncoding: described.encoding,
    contentType,
    remoteAddr: clientIp(req),
    responseStatus: overrideStatus,
    responseMs: Math.round(performance.now() - startedAt),
    responseNote: buildNote({ overrideStatus, overrideDelay, overrideBody }),
    replayOf: null,
  });

  const payload = overrideBody ?? JSON.stringify({ ok: true, requestId, receivedAt: new Date(receivedAt).toISOString() });
  const type =
    overrideContentType ?? (overrideBody === null ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');

  res.writeHead(overrideStatus, {
    'content-type': type,
    'content-length': Buffer.byteLength(payload),
    'x-hookline-request-id': String(requestId),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function buildNote({ overrideStatus, overrideDelay, overrideBody }) {
  const parts = [];
  if (overrideStatus !== 200) parts.push(`status → ${overrideStatus}`);
  if (overrideDelay > 0) parts.push(`delay → ${overrideDelay}ms`);
  if (overrideBody !== null) parts.push('custom body');
  return parts.length > 0 ? parts.join(', ') : null;
}

export { PayloadTooLargeError };

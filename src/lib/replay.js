const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'expect',
]);

const MAX_RESPONSE_CHARS = 200_000;

/** Removes headers that fetch() refuses to let callers set. */
export function sanitizeOutboundHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name)) continue;
    if (name === 'x-hookline-secret' || name === 'x-hookline-status' || name === 'x-hookline-delay') continue;
    if (name === 'x-hookline-body' || name === 'x-hookline-content-type') continue;
    if (value === null || value === undefined || value === '') continue;
    out[name] = String(value);
  }
  return out;
}

/**
 * Sends a stored request to a target URL. Never throws: transport problems are
 * returned as `{ ok: false, error }` so the dashboard can display them.
 */
export async function performReplay({ method, url, headers, body, timeoutMs = 15_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const hasBody = body !== null && body !== undefined && body.length > 0;
  const verb = method === 'HEAD' ? 'HEAD' : method;

  try {
    const response = await fetch(url, {
      method: verb,
      headers: sanitizeOutboundHeaders(headers),
      body: hasBody && verb !== 'GET' && verb !== 'HEAD' ? body : undefined,
      redirect: 'follow',
      signal: controller.signal,
    });

    const text = await response.text();
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: text.slice(0, MAX_RESPONSE_CHARS),
      truncated: text.length > MAX_RESPONSE_CHARS,
      durationMs: Date.now() - startedAt,
      requestId: response.headers.get('x-hookline-request-id'),
    };
  } catch (error) {
    const aborted = error.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? `Request timed out after ${timeoutMs} ms`
        : error.cause?.message || error.message || 'Request failed',
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

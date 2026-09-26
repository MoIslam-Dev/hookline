import http from 'node:http';

import { sendError, sendJson } from './lib/http.js';
import { handleApi } from './routes/api.js';
import { handleCapture } from './routes/capture.js';
import { serveUi } from './routes/ui.js';

const CAPTURE_ROUTE = /^\/h\/([a-z0-9]{4,64})(\/[^?]*)?$/i;

function log(config, req, url, status) {
  if (!config.dev) return;
  const stamp = new Date().toISOString();
  process.stdout.write(`${stamp} ${req.method} ${url.pathname}${url.search} → ${status}\n`);
}

export function createServer({ store, config, apiToken = null }) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      sendError(res, 400, 'bad_request', 'Malformed request URL.');
      return;
    }

    res.on('finish', () => log(config, req, url, res.statusCode));

    handle(req, res, url, { store, config, apiToken }).catch((error) => {
      if (config.dev) console.error('[hookline] unhandled error:', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error', message: error?.message ?? 'Unexpected error.' });
      } else {
        res.end();
      }
    });
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  return server;
}

async function handle(req, res, url, ctx) {
  const pathname = url.pathname.replace(/\/{2,}/g, '/');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS' });
    res.end();
    return;
  }

  const capture = CAPTURE_ROUTE.exec(pathname);
  if (capture) {
    await handleCapture(req, res, {
      ...ctx,
      url,
      token: capture[1],
      subPath: normaliseSubPath(capture[2]),
    });
    return;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    await handleApi(req, res, { ...ctx, url, pathname, method: req.method });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'method_not_allowed', 'Only GET and HEAD are supported outside of /h/ and /api/.');
    return;
  }

  await serveUi(req, res, url);
}

function normaliseSubPath(subPath) {
  if (!subPath) return '/';
  const trimmed = subPath.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

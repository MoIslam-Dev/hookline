import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PUBLIC_DIR } from '../config.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Serves the dashboard. Unknown paths fall back to index.html so the app can
 * own its own routing, except for asset-looking paths which 404 loudly.
 */
export async function serveUi(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = path.resolve(PUBLIC_DIR, `.${requested}`);

  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let file = resolved;
  let stat = await fs.stat(file).catch(() => null);

  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = await fs.stat(file).catch(() => null);
  }

  if (!stat) {
    const accepts = String(req.headers.accept ?? '');
    if (path.extname(requested) !== '' || !accepts.includes('text/html')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    file = path.join(PUBLIC_DIR, 'index.html');
    stat = await fs.stat(file).catch(() => null);
    if (!stat) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Dashboard assets are missing. Run HookLine from its project folder.');
      return;
    }
  }

  const isAsset = /\.(css|js|svg|png|jpg|webp|ico|woff2)$/i.test(file);
  res.writeHead(200, {
    'content-type': contentTypeFor(file),
    'content-length': stat.size,
    'cache-control': isAsset ? 'public, max-age=300' : 'no-store',
    'x-content-type-options': 'nosniff',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

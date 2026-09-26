import { randomBytes, randomUUID } from 'node:crypto';

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

function randomToken(length = 12) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toBuffer(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return null;
}

function mapBin(row) {
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    secret: row.secret || null,
    isPaused: Boolean(row.is_paused),
    retentionDays: row.retention_days,
    createdAt: row.created_at,
  };
}

function mapRequest(row) {
  if (!row) return null;
  const body = toBuffer(row.body);
  return {
    id: Number(row.id),
    binId: row.bin_id,
    receivedAt: row.received_at,
    method: row.method,
    path: row.path,
    query: parseJson(row.query, {}),
    headers: parseJson(row.headers, {}),
    body,
    bodyEncoding: row.body_encoding,
    contentType: row.content_type || null,
    remoteAddr: row.remote_addr || null,
    responseStatus: row.response_status,
    responseMs: row.response_ms === null ? null : Number(row.response_ms),
    responseNote: row.response_note || null,
    replayOf: row.replay_of === null ? null : Number(row.replay_of),
  };
}

/**
 * All SQL lives here. The rest of the app only talks to this class, so the
 * storage layer can be swapped without touching the HTTP layer.
 */
export class Store {
  constructor(db) {
    this.db = db;
  }

  // ---------------------------------------------------------------- settings

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, String(value));
  }

  /** Returns the stored API token, creating one on first run. */
  ensureToken() {
    const existing = this.getSetting('api_token');
    if (existing) return existing;
    const token = randomToken(32);
    this.setSetting('api_token', token);
    return token;
  }

  // -------------------------------------------------------------------- bins

  createBin({ name, secret = null, retentionDays = 7 }) {
    const id = randomUUID();
    const token = this.#uniqueToken();
    const createdAt = Date.now();
    this.db
      .prepare(
        `INSERT INTO bins (id, token, name, secret, is_paused, retention_days, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, token, name, secret, retentionDays, createdAt);
    return this.getBin(id);
  }

  #uniqueToken() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const token = randomToken(12);
      const exists = this.db.prepare('SELECT 1 FROM bins WHERE token = ?').get(token);
      if (!exists) return token;
    }
    throw new Error('Could not allocate a unique endpoint token.');
  }

  getBin(id) {
    return mapBin(this.db.prepare('SELECT * FROM bins WHERE id = ?').get(id));
  }

  getBinByToken(token) {
    return mapBin(this.db.prepare('SELECT * FROM bins WHERE token = ?').get(token));
  }

  listBins() {
    const rows = this.db
      .prepare(
        `SELECT b.*,
                (SELECT COUNT(*) FROM requests r WHERE r.bin_id = b.id) AS request_count,
                (SELECT MAX(r.received_at) FROM requests r WHERE r.bin_id = b.id) AS last_request_at
         FROM bins b
         ORDER BY b.created_at DESC`,
      )
      .all();
    return rows.map((row) => ({
      ...mapBin(row),
      requestCount: Number(row.request_count),
      lastRequestAt: row.last_request_at ? Number(row.last_request_at) : null,
    }));
  }

  updateBin(id, patch) {
    const bin = this.getBin(id);
    if (!bin) return null;

    const next = {
      name: patch.name === undefined ? bin.name : String(patch.name).trim() || bin.name,
      secret: patch.secret === undefined ? bin.secret : patch.secret,
      isPaused: patch.isPaused === undefined ? bin.isPaused : Boolean(patch.isPaused),
      retentionDays:
        patch.retentionDays === undefined
          ? bin.retentionDays
          : Math.min(365, Math.max(1, Math.trunc(Number(patch.retentionDays) || bin.retentionDays))),
    };

    this.db
      .prepare(
        `UPDATE bins SET name = ?, secret = ?, is_paused = ?, retention_days = ? WHERE id = ?`,
      )
      .run(next.name, next.secret, next.isPaused ? 1 : 0, next.retentionDays, id);

    return this.getBin(id);
  }

  deleteBin(id) {
    const result = this.db.prepare('DELETE FROM bins WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  clearBin(id) {
    const result = this.db.prepare('DELETE FROM requests WHERE bin_id = ?').run(id);
    return Number(result.changes);
  }

  // ---------------------------------------------------------------- requests

  recordRequest(entry) {
    const result = this.db
      .prepare(
        `INSERT INTO requests
           (bin_id, received_at, method, path, query, headers, body, body_encoding,
            content_type, remote_addr, response_status, response_ms, response_note, replay_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.binId,
        entry.receivedAt,
        entry.method,
        entry.path,
        JSON.stringify(entry.query ?? {}),
        JSON.stringify(entry.headers ?? {}),
        entry.body ?? null,
        entry.bodyEncoding ?? 'utf8',
        entry.contentType ?? null,
        entry.remoteAddr ?? null,
        entry.responseStatus,
        entry.responseMs ?? null,
        entry.responseNote ?? null,
        entry.replayOf ?? null,
      );
    return Number(result.lastInsertRowid);
  }

  getRequest(id) {
    return mapRequest(this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id));
  }

  /** Marks a freshly captured request as the result of replaying `originalId`. */
  linkReplay(newRequestId, originalId) {
    this.db.prepare('UPDATE requests SET replay_of = ? WHERE id = ?').run(originalId, newRequestId);
    return this.getRequest(newRequestId);
  }

  listRequests(binId, { search = '', method = '', status = '', limit = 50, before = null } = {}) {
    const clauses = ['bin_id = ?'];
    const params = [binId];

    if (method) {
      clauses.push('method = ?');
      params.push(String(method).toUpperCase());
    }
    if (status === 'error') {
      clauses.push('response_status >= 400');
    } else if (status) {
      clauses.push('response_status = ?');
      params.push(Number(status));
    }
    if (before) {
      clauses.push('received_at < ?');
      params.push(Number(before));
    }
    if (search) {
      clauses.push('(path LIKE ? OR headers LIKE ? OR body LIKE ?)');
      const like = `%${String(search).replace(/[%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like);
    }

    const safeLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
    const rows = this.db
      .prepare(
        `SELECT id, bin_id, received_at, method, path, query, content_type,
                length(body) AS body_size, response_status, response_ms
         FROM requests
         WHERE ${clauses.join(' AND ')}
         ORDER BY received_at DESC, id DESC
         LIMIT ?`,
      )
      .all(...params, safeLimit);

    const items = rows.map((row) => ({
      id: Number(row.id),
      binId: row.bin_id,
      receivedAt: row.received_at,
      method: row.method,
      path: row.path,
      query: parseJson(row.query, {}),
      contentType: row.content_type || null,
      bodySize: row.body_size === null ? 0 : Number(row.body_size),
      responseStatus: row.response_status,
      responseMs: row.response_ms === null ? null : Number(row.response_ms),
    }));

    const hasMore =
      items.length === safeLimit
        ? Boolean(
            this.db
              .prepare(
                `SELECT 1 FROM requests WHERE bin_id = ? AND received_at < ? LIMIT 1`,
              )
              .get(binId, items[items.length - 1].receivedAt),
          )
        : false;

    return { items, hasMore };
  }

  /** Summary numbers for the dashboard header. */
  stats(binId = null) {
    const dayAgo = Date.now() - DAY_MS;
    if (binId) {
      const row = this.db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS last_24h,
             SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS errors,
             SUM(COALESCE(length(body), 0)) AS bytes,
             AVG(response_ms) AS avg_ms
           FROM requests WHERE bin_id = ?`,
        )
        .get(dayAgo, binId);
      return normalizeStats(row);
    }
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS last_24h,
           SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS errors,
           SUM(COALESCE(length(body), 0)) AS bytes,
           AVG(response_ms) AS avg_ms
         FROM requests`,
      )
      .get(dayAgo);
    return { ...normalizeStats(row), bins: this.listBins().length };
  }

  /** Full JSON dump of a bin, used by the "Export" button. */
  exportBin(id) {
    const bin = this.getBin(id);
    if (!bin) return null;
    const { items } = this.listRequests(id, { limit: 200 });
    const requests = [];
    for (const summary of items) {
      const full = this.getRequest(summary.id);
      requests.push({
        id: full.id,
        receivedAt: new Date(full.receivedAt).toISOString(),
        method: full.method,
        path: full.path,
        query: full.query,
        headers: full.headers,
        body: full.body ? full.body.toString('utf8') : null,
        contentType: full.contentType,
        remoteAddr: full.remoteAddr,
        responseStatus: full.responseStatus,
        responseMs: full.responseMs,
      });
    }
    return {
      exportedAt: new Date().toISOString(),
      endpoint: { name: bin.name, url: `/h/${bin.token}`, retentionDays: bin.retentionDays },
      total: requests.length,
      requests,
    };
  }

  /** Deletes captured requests that are older than their bin's retention window. */
  pruneExpired(now = Date.now()) {
    const rows = this.db.prepare('SELECT id, retention_days, created_at FROM bins').all();
    let removed = 0;
    for (const row of rows) {
      const cutoff = now - row.retention_days * DAY_MS;
      const result = this.db
        .prepare('DELETE FROM requests WHERE bin_id = ? AND received_at < ?')
        .run(row.id, cutoff);
      removed += Number(result.changes);
    }
    return removed;
  }
}

function normalizeStats(row) {
  return {
    total: Number(row?.total ?? 0),
    last24h: Number(row?.last_24h ?? 0),
    errors: Number(row?.errors ?? 0),
    bytes: Number(row?.bytes ?? 0),
    avgMs: row?.avg_ms === null || row?.avg_ms === undefined ? null : Math.round(Number(row.avg_ms)),
  };
}

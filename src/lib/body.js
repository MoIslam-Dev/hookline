import { Buffer, isUtf8 } from 'node:buffer';

/**
 * Reads the raw request body into a Buffer, refusing anything larger than
 * `limitBytes`. Throws an error carrying `statusCode = 413`.
 */
export async function readRawBody(req, limitBytes) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes) {
    const error = new Error('Payload too large');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error('Payload too large');
      error.statusCode = 413;
      error.overflow = true;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export class PayloadTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Payload exceeds the ${limitBytes} byte limit`);
    this.statusCode = 413;
    this.limitBytes = limitBytes;
  }
}

/**
 * Turns a raw body Buffer into a storable representation.
 * Text bodies are kept as UTF-8; binary payloads (images, PDFs, protobuf) are
 * base64-encoded so nothing is corrupted in the database.
 */
export function describeBody(buffer, contentType = '') {
  const size = buffer ? buffer.length : 0;
  if (!buffer || size === 0) {
    return { encoding: 'utf8', text: '', size: 0, json: null, form: null, binary: false };
  }

  const type = (contentType || '').toLowerCase();
  const looksBinary =
    !isUtf8(buffer) ||
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type.startsWith('video/') ||
    type.includes('octet-stream') ||
    type.includes('protobuf');

  if (looksBinary) {
    return {
      encoding: 'base64',
      text: buffer.toString('base64'),
      size,
      json: null,
      form: null,
      binary: true,
    };
  }

  const text = buffer.toString('utf8');
  const result = { encoding: 'utf8', text, size, json: null, form: null, binary: false };

  if (type.includes('json') || looksLikeJson(text)) {
    try {
      result.json = JSON.parse(text);
    } catch {
      /* keep raw text when the body is not valid JSON */
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    result.form = Object.fromEntries(new URLSearchParams(text));
  }

  return result;
}

function looksLikeJson(text) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '{' && last === '}') || (first === '[' && last === ']');
}

/** Reads and parses a JSON request body with a hard size cap. */
export async function readJsonBody(req, limitBytes = 256 * 1024) {
  let buffer;
  try {
    buffer = await readRawBody(req, limitBytes);
  } catch (error) {
    if (error.statusCode === 413) throw new PayloadTooLargeError(limitBytes);
    throw error;
  }
  if (buffer.length === 0) return {};
  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('Request body must be a JSON object.');
    }
    return parsed;
  } catch (error) {
    const wrapped = new Error(error.message || 'Invalid JSON body');
    wrapped.statusCode = 400;
    throw wrapped;
  }
}

/** Flattens Node's repeated headers (`set-cookie`, …) into a plain object. */
export function normalizeHeaders(rawHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

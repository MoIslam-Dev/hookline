/**
 * Turns a captured request into ready-to-paste code snippets.
 * Used by the dashboard ("Copy as…") and by the replay feature.
 */

import { Buffer } from 'node:buffer';

const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

function shellQuote(value) {
  const str = String(value);
  if (str.length > 0 && SHELL_SAFE.test(str)) return str;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function langString(value) {
  return JSON.stringify(String(value));
}

function headerEntries(headers) {
  return Object.entries(headers ?? {});
}

function formatBodyText(body) {
  if (body === null || body === undefined) return '';
  return typeof body === 'string' ? body : String(body);
}

export function toCurl({ method, url, headers, body }) {
  const parts = [`curl -X ${method} ${shellQuote(url)}`];
  for (const [key, value] of headerEntries(headers)) {
    parts.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
  }
  const text = formatBodyText(body);
  if (text.length > 0) {
    parts.push(`  --data-raw ${shellQuote(text)}`);
  }
  return parts.join(' \\\n');
}

export function toJavaScript({ method, url, headers, body }) {
  const text = formatBodyText(body);
  const lines = [
    `const response = await fetch(${jsString(url)}, {`,
    `  method: ${jsString(method)},`,
    `  headers: ${JSON.stringify(headers ?? {}, null, 2).replace(/\n/g, '\n  ')},`,
  ];
  if (text.length > 0) lines.push(`  body: ${jsString(text)},`);
  lines.push('});', '', 'console.log(response.status, await response.text());');
  return lines.join('\n');
}

export function toPython({ method, url, headers, body }) {
  const text = formatBodyText(body);
  const lines = ['import requests', '', `url = ${langString(url)}`, `headers = ${JSON.stringify(headers ?? {}, null, 2)}`];
  const verb = method.toLowerCase();
  if (text.length > 0) {
    lines.push('', `response = requests.${verb}(url, headers=headers, data=${langString(text)})`);
  } else {
    lines.push('', `response = requests.${verb}(url, headers=headers)`);
  }
  lines.push('', 'print(response.status_code)', 'print(response.text)');
  return lines.join('\n');
}

export function toNode({ method, url, headers, body }) {
  const text = formatBodyText(body);
  const client = url.startsWith('https:') ? 'node:https' : 'node:http';
  const lines = [
    `import ${url.startsWith('https:') ? 'https' : 'http'} from '${client}';`,
    '',
    `const options = ${JSON.stringify({ method, headers: headers ?? {} }, null, 2)};`,
    '',
    `const req = ${url.startsWith('https:') ? 'https' : 'http'}.request(${jsString(url)}, options, (res) => {`,
    '  let data = "";',
    '  res.on("data", (chunk) => (data += chunk));',
    '  res.on("end", () => console.log(res.statusCode, data));',
    '});',
    '',
    'req.on("error", console.error);',
  ];
  if (text.length > 0) lines.push(`req.write(${jsString(text)});`);
  lines.push('req.end();');
  return lines.join('\n');
}

export function toRawHttp({ method, url, headers, body }) {
  const parsed = new URL(url);
  const target = `${parsed.pathname}${parsed.search}`;
  const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  const lines = [`${method} ${target} HTTP/1.1`, `Host: ${host}`];
  const has = new Set(Object.keys(headers ?? {}));
  if (!has.has('content-length') && formatBodyText(body).length > 0) {
    lines.push(`Content-Length: ${Buffer.byteLength(formatBodyText(body), 'utf8')}`);
  }
  for (const [key, value] of headerEntries(headers)) lines.push(`${key}: ${value}`);
  lines.push('', formatBodyText(body));
  return lines.join('\n');
}

export function buildCodeSnippets(request) {
  return {
    curl: toCurl(request),
    javascript: toJavaScript(request),
    python: toPython(request),
    node: toNode(request),
    http: toRawHttp(request),
  };
}

export const SNIPPET_LANGUAGES = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node.js' },
  { id: 'http', label: 'HTTP' },
];

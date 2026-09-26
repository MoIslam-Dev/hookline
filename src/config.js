import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

export const VERSION = '1.0.0';

const HELP = `HookLine ${VERSION} - self-hosted webhook & request inspector

Usage:
  hookline [options]

Options:
  -p, --port <number>       Port to listen on (default: 4000, or $PORT)
      --host <address>      Address to bind (default: 127.0.0.1, or $HOST)
      --token <string>      Dashboard API token (default: generated & stored)
      --data <dir>          Directory for the SQLite file (default: ./data)
      --retention <days>    Default retention for new endpoints (default: 7)
      --max-body <bytes>    Max captured request body size (default: 1048576)
      --public-url <url>    Base URL used when generating shareable links
      --dev                 Log every request to the console
  -h, --help                Show this help
  -v, --version             Show the version

Examples:
  hookline
  hookline --port 8080 --host 0.0.0.0
  HOOKLINE_TOKEN=my-secret hookline --retention 30
`;

const ALIASES = {
  p: 'port',
  h: 'help',
  v: 'version',
};

const NUMERIC = new Set(['port', 'retention', 'max-body']);
const BOOLEAN = new Set(['help', 'version', 'dev']);

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Minimal, dependency-free argv parser.
 * Supports `--key value`, `--key=value`, `--flag` and short aliases.
 */
export function parseArgs(argv = []) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    const isLong = arg.startsWith('--');
    const raw = isLong ? arg.slice(2) : arg.slice(1);
    const [nameRaw, inlineValue] = raw.includes('=')
      ? [raw.slice(0, raw.indexOf('=')), raw.slice(raw.indexOf('=') + 1)]
      : [raw, undefined];

    let name = nameRaw;
    if (!isLong && ALIASES[name]) name = ALIASES[name];
    name = camelToKebab(name);

    if (BOOLEAN.has(name)) {
      options[name] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('-') && !/^-?\d/.test(next))) {
        throw new Error(`Option --${name} requires a value.`);
      }
      value = next;
      i += 1;
    }

    if (NUMERIC.has(name)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Option --${name} must be a positive number (received "${value}").`);
      }
      options[name] = parsed;
      continue;
    }

    options[name] = value;
  }

  return { options, positionals };
}

function pickInt(value, fallback, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Build the effective runtime configuration from CLI options + environment.
 * Precedence: CLI option > environment variable > default.
 */
export function buildConfig({ options = {}, env = {}, cwd = process.cwd() } = {}) {
  const port = pickInt(options.port ?? env.PORT, 4000, { min: 0, max: 65535 });
  const host = options.host ?? env.HOST ?? '127.0.0.1';
  const dataDir = path.resolve(cwd, options.data ?? env.HOOKLINE_DATA ?? 'data');
  const retentionDays = pickInt(options.retention ?? env.HOOKLINE_RETENTION, 7, {
    min: 1,
    max: 365,
  });
  const maxBodyBytes = pickInt(options.maxBody ?? env.HOOKLINE_MAX_BODY, 1024 * 1024, {
    min: 1024,
    max: 50 * 1024 * 1024,
  });

  const publicUrl =
    options['public-url'] ?? env.HOOKLINE_PUBLIC_URL ?? `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;

  return {
    version: VERSION,
    port,
    host,
    dataDir,
    databaseFile: path.join(dataDir, 'hookline.sqlite'),
    retentionDays,
    maxBodyBytes,
    publicUrl: publicUrl.replace(/\/+$/, ''),
    token: options.token ?? env.HOOKLINE_TOKEN ?? null,
    dev: Boolean(options.dev ?? env.HOOKLINE_DEV),
    log: options.log ?? env.HOOKLINE_LOG ?? null,
    help: Boolean(options.help),
    showVersion: Boolean(options.version),
  };
}

export { HELP };

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { HELP, VERSION, buildConfig, parseArgs } from './config.js';
import { openDatabase } from './db.js';
import { createServer } from './server.js';
import { Store } from './store.js';

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

function printBanner(config, { token, createdToken, port }) {
  const base = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}`;
  const line = '─'.repeat(64);
  process.stdout.write(
    [
      '',
      `  HookLine ${config.version} — webhook & request inspector`,
      `  ${line}`,
      `  Dashboard   ${base}`,
      `  Public URL  ${config.publicUrl}`,
      `  Endpoints   ${config.publicUrl}/h/<token>`,
      `  Database    ${config.databaseFile}`,
      `  Retention   ${config.retentionDays} day(s)   Max body ${config.maxBodyBytes} bytes`,
      `  API token   ${token}${createdToken ? '  (generated, stored in the database)' : ''}`,
      `  ${line}`,
      '  Send a test request:',
      `    curl -X POST ${base}/api/bins \\`,
      `      -H "x-hookline-token: ${token}" \\`,
      `      -H "content-type: application/json" \\`,
      `      -d \'{"name":"document-status","id":"evt_8f2k"}\'`,
      '',
    ].join('\n'),
  );
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\nRun hookline --help for usage.\n`);
    process.exitCode = 1;
    return;
  }

  if (parsed.options.help) {
    process.stdout.write(HELP);
    return;
  }

  const config = buildConfig({ options: parsed.options, env: process.env });

  if (parsed.options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  fs.mkdirSync(config.dataDir, { recursive: true });

  const db = openDatabase(config.databaseFile);
  const store = new Store(db);

  const existingToken = config.token ?? store.ensureToken();
  const usingGeneratedToken = !config.token;
  if (config.token) store.setSetting('api_token', config.token);
  store.pruneExpired();

  const server = createServer({ store, config, apiToken: existingToken });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  const runtimeConfig = { ...config, port };
  printBanner(runtimeConfig, {
    token: existingToken,
    createdToken: usingGeneratedToken,
    port,
  });

  const pruneTimer = setInterval(() => {
    const removed = store.pruneExpired();
    if (removed > 0 && config.dev) console.log(`[hookline] pruned ${removed} expired request(s)`);
  }, PRUNE_INTERVAL_MS);
  pruneTimer.unref();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n[hookline] ${signal} received, shutting down.\n`);
    clearInterval(pruneTimer);
    server.close(() => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (config.log) fs.appendFileSync(path.resolve(config.log), `${new Date().toISOString()} started\n`);
}

main().catch((error) => {
  process.stderr.write(`[hookline] failed to start: ${error.message}\n`);
  if (process.env.HOOKLINE_DEV) console.error(error);
  process.exit(1);
});

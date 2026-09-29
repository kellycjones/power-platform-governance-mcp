#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LocalEmbedder } from './embedder.js';
import { startHttpServer } from './http.js';
import { loadIndex } from './index-store.js';
import { logToStderr as log } from './log.js';
import { HybridSearcher } from './search/hybrid.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

const USAGE = `Usage: power-platform-governance-mcp [--http] [--port 3000] [--host 127.0.0.1] [--index path]

  (default)   stdio transport, for Claude Desktop, Claude Code, VS Code and other local clients
  --http      Streamable HTTP transport on /mcp, for Copilot Studio and remote agents

Environment:
  MCP_API_KEY          require this key on /mcp (Bearer token or x-api-key header)
  MCP_ALLOWED_HOSTS    comma-separated Host headers to accept, e.g. your tunnel's hostname
  INDEX_PATH           search index to load (default: data/index.json)`;

const { values } = parseArgs({
  options: {
    http: { type: 'boolean', default: false },
    port: { type: 'string' },
    host: { type: 'string' },
    index: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.error(USAGE);
  process.exit(0);
}

if (!values.http) {
  // In stdio mode stdout carries the protocol; route any library console output to stderr.
  console.log = console.info = console.warn = console.error;
}

const indexPath = values.index ?? process.env.INDEX_PATH ?? fileURLToPath(new URL('../data/index.json', import.meta.url));

try {
  const index = await loadIndex(indexPath);
  const embedder = new LocalEmbedder(index.model);
  const searcher = new HybridSearcher(index.sections, index.vectors, embedder);
  const create = () => createServer({ searcher, source: index.source });

  // Load the embedding model now so the first query isn't slow.
  const warmup = embedder.embedQuery('warm up').catch((error: unknown) => {
    log('embedder_failed', { error: error instanceof Error ? error.message : String(error) });
  });

  const info = { server: SERVER_NAME, version: SERVER_VERSION, sections: index.sections.length, model: index.model, commit: index.source.commit.slice(0, 7) };

  if (values.http) {
    const host = values.host ?? '127.0.0.1';
    const apiKey = process.env.MCP_API_KEY || undefined;
    // Extra Host headers (e.g. a dev tunnel's hostname) are accepted on top of localhost.
    const extraHosts = (process.env.MCP_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
    const allowedHosts = extraHosts.length ? ['localhost', '127.0.0.1', '[::1]', ...extraHosts] : undefined;
    if (!apiKey && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
      log('warning', { message: `Listening on ${host} without MCP_API_KEY: anyone who can reach this port can query the server.` });
    }
    const { url } = await startHttpServer(create, { port: Number(values.port ?? process.env.PORT ?? 3000), host, apiKey, allowedHosts });
    await warmup;
    log('listening', { ...info, transport: 'http', url, auth: apiKey ? 'api-key' : 'none' });
  } else {
    await create().connect(new StdioServerTransport());
    log('listening', { ...info, transport: 'stdio' });
  }
} catch (error) {
  log('startup_failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
}

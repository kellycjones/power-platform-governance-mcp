import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHttpServer } from '../src/http.js';
import { silentLogger } from '../src/log.js';
import { createServer } from '../src/server.js';
import { fixtureSearcher, SOURCE } from './helpers.js';

async function connectInMemory() {
  const { searcher } = await fixtureSearcher();
  const server = createServer({ searcher, source: SOURCE, log: silentLogger });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

type SearchResult = { results: { id: string; url: string; matchedBy: string[] }[] };

describe('MCP server (in memory)', () => {
  it('advertises its tools, prompt and usage instructions', async () => {
    const client = await connectInMemory();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['list_documents', 'read_section', 'search_docs']);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    const search = tools.find((t) => t.name === 'search_docs')!;
    expect(search.inputSchema.properties).toHaveProperty('area');
    expect(search.outputSchema).toBeDefined();
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(['governance_question']);
    expect(client.getInstructions()).toMatch(/cite the section URLs/);
  });

  it('search_docs returns structured, citable results', async () => {
    const client = await connectInMemory();
    const result = await client.callTool({ name: 'search_docs', arguments: { query: 'block the HTTP connector', limit: 2 } });
    const { results } = result.structuredContent as SearchResult;
    expect(results).toHaveLength(2);
    expect(results[0]!.url).toBe('https://learn.microsoft.com/power-platform/admin/dlp-connector-classification#block-connectors');
    expect((result.content as { text: string }[])[0]!.text).toContain(results[0]!.url);
  });

  it('rejects invalid arguments', async () => {
    const client = await connectInMemory();
    const result = await client.callTool({ name: 'search_docs', arguments: { query: 'x', area: 'nope' } });
    expect(result.isError).toBe(true);
  });

  it('read_section returns full text, and a helpful error for unknown ids', async () => {
    const client = await connectInMemory();
    const ok = await client.callTool({ name: 'read_section', arguments: { id: 'admin/managed-environment-sharing-limits#0' } });
    expect((ok.structuredContent as { text: string }).text).toContain('limitSharingMode');
    const missing = await client.callTool({ name: 'read_section', arguments: { id: 'admin/nope#9' } });
    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]!.text).toMatch(/search_docs/);
  });

  it('list_documents groups sections by page', async () => {
    const client = await connectInMemory();
    const result = await client.callTool({ name: 'list_documents', arguments: { area: 'admin' } });
    const { documents, source } = result.structuredContent as {
      documents: { id: string; sections: number }[];
      source: { license: string };
    };
    expect(documents.map((d) => d.id)).toEqual(['admin/dlp-connector-classification', 'admin/managed-environment-sharing-limits']);
    expect(documents[0]!.sections).toBe(3);
    expect(source.license).toBe('CC-BY-4.0');
  });
});

describe('MCP server (Streamable HTTP)', () => {
  const API_KEY = 'test-key-123';
  let http: Server;
  let url: string;

  beforeAll(async () => {
    const { searcher } = await fixtureSearcher();
    const started = await startHttpServer(() => createServer({ searcher, source: SOURCE, log: silentLogger }), {
      port: 0,
      host: '127.0.0.1',
      apiKey: API_KEY,
      log: silentLogger,
    });
    http = started.server;
    url = started.url;
  });

  afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())));

  it('answers health checks without a key', async () => {
    const response = await fetch(url.replace('/mcp', '/healthz'));
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('rejects requests without the right API key', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers: { ...headers, 'x-api-key': 'wrong' }, body })).status).toBe(401);
  });

  it('serves tools to a client that sends the key (x-api-key or Bearer)', async () => {
    const variants: Record<string, string>[] = [{ 'x-api-key': API_KEY }, { authorization: `Bearer ${API_KEY}` }];
    for (const headers of variants) {
      const client = new Client({ name: 'http-test', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
      const result = await client.callTool({ name: 'search_docs', arguments: { query: 'limitSharingMode' } });
      expect((result.structuredContent as SearchResult).results[0]!.id).toBe('admin/managed-environment-sharing-limits#0');
      await client.close();
    }
  });
});

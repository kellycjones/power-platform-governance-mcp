import { createHash, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { NextFunction, Request, Response } from 'express';
import { logToStderr, type Logger } from './log.js';

export interface HttpOptions {
  port: number;
  host: string;
  /** When set, every /mcp request must send it as "Authorization: Bearer <key>" or "x-api-key: <key>". */
  apiKey?: string;
  /** Host headers to accept (needed behind a tunnel or proxy; localhost is protected by default). */
  allowedHosts?: string[];
  log?: Logger;
}

/**
 * Streamable HTTP transport in stateless mode: every POST gets a fresh server
 * and transport, so instances can scale out behind a load balancer (or run on
 * Azure Functions / Container Apps) with no shared session state.
 */
export async function startHttpServer(createServer: () => McpServer, options: HttpOptions): Promise<{ server: Server; url: string }> {
  const log = options.log ?? logToStderr;
  const app = createMcpExpressApp({ host: options.host, allowedHosts: options.allowedHosts });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
    if (!options.apiKey) return next();
    const provided = bearerToken(req.headers.authorization) ?? header(req.headers['x-api-key']);
    if (provided && safeEqual(provided, options.apiKey)) return next();
    log('auth_rejected', { ip: req.ip, reason: provided ? 'wrong key' : 'no key' });
    res.status(401).json(rpcError(-32001, 'Unauthorized: send the API key as a Bearer token or x-api-key header.'));
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('request_failed', { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) res.status(500).json(rpcError(-32603, 'Internal server error'));
    }
  });

  // Stateless mode has no server-initiated stream or session to delete.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json(rpcError(-32000, 'Method not allowed.'));
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://${options.host.includes(':') ? `[${options.host}]` : options.host}:${port}/mcp` });
    });
    server.on('error', reject);
  });
}

function bearerToken(value: string | undefined): string | undefined {
  const match = value ? /^Bearer\s+(.+)$/i.exec(value) : null;
  return match?.[1]?.trim();
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Constant-time comparison that also hides the key's length. */
function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function rpcError(code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

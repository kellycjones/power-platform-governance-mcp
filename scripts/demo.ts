/**
 * Starts the built server over stdio as a real MCP client would, then runs a
 * few questions through it. Usage: npm run demo [-- "your question"]
 */
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const questions = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'How do I stop makers from using the HTTP connector?',
      'Is the CoE Starter Kit still being updated?',
      'What happens when two data policies apply to the same environment?',
    ];

const client = new Client({ name: 'demo', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dirname, '..', 'dist', 'index.js')],
    stderr: 'ignore',
  }),
);

const { tools } = await client.listTools();
console.log(`Connected. Tools: ${tools.map((t) => t.name).join(', ')}\n`);

for (const query of questions) {
  const started = Date.now();
  const result = await client.callTool({ name: 'search_docs', arguments: { query, limit: 3 } });
  console.log(`> search_docs "${query}"  (${Date.now() - started} ms)\n`);
  for (const block of result.content as { type: string; text?: string }[]) {
    if (block.type === 'text') console.log(block.text);
  }
  console.log('\n' + '-'.repeat(80) + '\n');
}

await client.close();

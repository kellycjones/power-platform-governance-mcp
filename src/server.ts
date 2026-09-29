import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CorpusSource } from './index-store.js';
import { logToStderr, type Logger } from './log.js';
import type { HybridSearcher } from './search/hybrid.js';

export const SERVER_NAME = 'power-platform-governance';
export const SERVER_VERSION = '1.0.0';

export interface ServerContext {
  searcher: HybridSearcher;
  source: CorpusSource;
  log?: Logger;
}

const INSTRUCTIONS = `Answers questions about governing Microsoft Power Platform: data policies (DLP), connector classification, environments and environment groups, Managed Environments, security roles, the CoE Starter Kit and ALM.
Call search_docs first, then read_section for any result you need in full. Base answers on the returned text and cite the section URLs. If nothing relevant comes back, say so instead of guessing.`;

const hitSchema = z.object({
  id: z.string().describe('Section id; pass to read_section for the full text.'),
  title: z.string().describe('Page title.'),
  heading: z.string().describe('Heading trail inside the page.'),
  area: z.string(),
  url: z.string().describe('Deep link to the section on learn.microsoft.com. Cite this.'),
  snippet: z.string(),
  score: z.number().describe('Fused keyword + semantic relevance; higher is better.'),
  matchedBy: z.array(z.enum(['keyword', 'semantic'])),
});

export function createServer({ searcher, source, log = logToStderr }: ServerContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  const areas = [...new Set(searcher.sections.map((s) => s.area))].sort() as [string, ...string[]];

  server.registerTool(
    'search_docs',
    {
      title: 'Search Power Platform governance docs',
      description:
        'Hybrid keyword + semantic search over Microsoft Power Platform governance documentation. ' +
        'Returns the best-matching sections with deep links to cite.',
      inputSchema: {
        query: z.string().min(2).describe('A question or keywords, e.g. "block HTTP connector in the default environment".'),
        area: z.enum(areas).optional().describe(`Limit to one part of the docs: ${areas.join(', ')}.`),
        limit: z.number().int().min(1).max(10).default(5).describe('How many sections to return (1-10).'),
      },
      outputSchema: { query: z.string(), results: z.array(hitSchema) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, area, limit }) => {
      const started = performance.now();
      const hits = await searcher.search(query, { area, limit });
      const results = hits.map(({ section, score, matchedBy }) => ({
        id: section.id,
        title: section.docTitle,
        heading: section.heading,
        area: section.area,
        url: section.url,
        snippet: snippet(section.text),
        score: Number(score.toFixed(4)),
        matchedBy,
      }));
      log('tool_call', {
        tool: 'search_docs',
        ms: Math.round(performance.now() - started),
        area: area ?? null,
        results: results.length,
        top: results[0]?.id ?? null,
      });

      const text = results.length
        ? results
            .map(
              (r, i) =>
                `${i + 1}. ${r.heading === r.title ? r.title : `${r.title} › ${r.heading}`}\n   ${r.url}\n   id: ${r.id} · matched by ${r.matchedBy.join(' + ')}\n   ${r.snippet}`,
            )
            .join('\n\n')
        : `No sections matched "${query}".`;
      return { content: [{ type: 'text', text }], structuredContent: { query, results } };
    },
  );

  server.registerTool(
    'read_section',
    {
      title: 'Read a docs section',
      description: 'Returns the full text of one section found by search_docs, with its citation URL.',
      inputSchema: { id: z.string().describe('Section id from search_docs, e.g. "admin/dlp-policy-scope#1".') },
      outputSchema: { id: z.string(), title: z.string(), heading: z.string(), url: z.string(), text: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const section = searcher.get(id);
      log('tool_call', { tool: 'read_section', id, found: Boolean(section) });
      if (!section) {
        return {
          isError: true,
          content: [{ type: 'text', text: `No section with id "${id}". Use an id returned by search_docs.` }],
        };
      }
      const result = {
        id: section.id,
        title: section.docTitle,
        heading: section.heading,
        url: section.url,
        text: section.text,
      };
      return {
        content: [{ type: 'text', text: `# ${result.title} › ${result.heading}\nSource: ${result.url}\n\n${result.text}` }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    'list_documents',
    {
      title: 'List indexed documents',
      description: 'Lists the documentation pages this server can search, optionally for one area.',
      inputSchema: { area: z.enum(areas).optional() },
      outputSchema: {
        source: z.object({ repo: z.string(), commit: z.string(), license: z.string() }),
        documents: z.array(z.object({ id: z.string(), title: z.string(), area: z.string(), url: z.string(), sections: z.number() })),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ area }) => {
      const pages = new Map<string, { id: string; title: string; area: string; url: string; sections: number }>();
      for (const s of searcher.sections) {
        if (area && s.area !== area) continue;
        const page = pages.get(s.docId);
        if (page) page.sections++;
        else pages.set(s.docId, { id: s.docId, title: s.docTitle, area: s.area, url: s.url.split('#')[0]!, sections: 1 });
      }
      const documents = [...pages.values()].sort((a, b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title));
      log('tool_call', { tool: 'list_documents', area: area ?? null, documents: documents.length });
      const text = documents.map((d) => `- [${d.area}] ${d.title} (${d.sections} sections): ${d.url}`).join('\n');
      return {
        content: [{ type: 'text', text: `${documents.length} documents from ${source.repo}@${source.commit.slice(0, 7)} (${source.license})\n${text}` }],
        structuredContent: { source: { repo: source.repo, commit: source.commit, license: source.license }, documents },
      };
    },
  );

  server.registerPrompt(
    'governance_question',
    {
      title: 'Answer a governance question with citations',
      description: 'Researches a Power Platform governance question in the docs and answers with cited sources.',
      argsSchema: { question: z.string().describe('The question to answer.') },
    },
    ({ question }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Answer this Power Platform governance question: ${question}\n\n` +
              'Use search_docs (try a second phrasing if the first results are weak) and read_section for detail. ' +
              'Answer in plain language for an admin, cite each claim with its section URL, and say clearly if the docs do not cover it.',
          },
        },
      ],
    }),
  );

  return server;
}

function snippet(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, flat.lastIndexOf(' ', max))}…`;
}

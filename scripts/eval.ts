/**
 * Retrieval evaluation: runs every question in eval/questions.json through
 * each search configuration and scores whether the right page comes back.
 *
 *   hit@1  right page is the top result
 *   hit@5  right page is in the top five
 *   MRR    mean of 1/rank of the first right page (0 if not in the top 10)
 *
 * Questions come in two kinds: "paraphrase" (plain-English questions that
 * don't reuse the docs' wording) and "exact-term" (PowerShell cmdlets and
 * setting names, where keyword search should shine).
 *
 * Usage: npm run eval [-- --index data/other-index.json]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LocalEmbedder } from '../src/embedder.js';
import { loadIndex } from '../src/index-store.js';
import { HybridSearcher, type SearchOptions } from '../src/search/hybrid.js';

interface Question {
  kind: 'paraphrase' | 'exact-term';
  question: string;
  expected: string[];
}

const ROOT = join(import.meta.dirname, '..');
const { values } = parseArgs({ options: { index: { type: 'string' } } });

const questions = JSON.parse(await readFile(join(ROOT, 'eval', 'questions.json'), 'utf8')) as Question[];
const index = await loadIndex(values.index ?? join(ROOT, 'data', 'index.json'));
const searcher = new HybridSearcher(index.sections, index.vectors, new LocalEmbedder(index.model));

const configs: { label: string; options: SearchOptions }[] = [
  { label: 'keyword only (BM25)', options: { mode: 'keyword' } },
  { label: 'semantic only', options: { mode: 'semantic' } },
  { label: 'hybrid, rank fusion (RRF)', options: { fusion: 'rrf' } },
  { label: 'hybrid, score fusion (default)', options: {} },
];
const ranks: number[][] = configs.map(() => []);
const misses: string[] = [];

for (const [c, config] of configs.entries()) {
  for (const q of questions) {
    const hits = await searcher.search(q.question, { ...config.options, limit: 10 });
    const rank = hits.findIndex((h) => q.expected.includes(h.section.docId)) + 1;
    ranks[c]!.push(rank);
    if (c === configs.length - 1 && rank !== 1) {
      misses.push(`  ${rank ? `#${rank}  ` : 'miss'}  "${q.question}" (top: ${hits[0]?.section.docId ?? 'none'})`);
    }
  }
}

const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`;
const hitAt = (r: number[], k: number) => r.filter((x) => x >= 1 && x <= k).length;
const mrr = (r: number[]) => r.reduce((sum, x) => sum + (x ? 1 / x : 0), 0) / r.length;
const kinds = ['paraphrase', 'exact-term'] as const;
const counts = kinds.map((k) => questions.filter((q) => q.kind === k).length);

console.log(`${questions.length} questions (${counts[0]} paraphrase, ${counts[1]} exact-term) · ${index.sections.length} sections · ${index.model}\n`);
console.log('| Search | hit@1 | hit@5 | MRR | Paraphrase hit@1 | Exact-term hit@1 |');
console.log('|---|---|---|---|---|---|');
for (const [c, config] of configs.entries()) {
  const r = ranks[c]!;
  const byKind = kinds.map((k, i) => pct(hitAt(r.filter((_, j) => questions[j]!.kind === k), 1), counts[i]!));
  console.log(`| ${config.label} | ${pct(hitAt(r, 1), r.length)} | ${pct(hitAt(r, 5), r.length)} | ${mrr(r).toFixed(2)} | ${byKind[0]} | ${byKind[1]} |`);
}
if (misses.length) console.log(`\nDefault search, not ranked first:\n${misses.join('\n')}`);

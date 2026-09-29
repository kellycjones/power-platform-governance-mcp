/**
 * Chunks every doc in corpus/ into sections, embeds them locally and writes
 * data/index.json for the server to load.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { chunkDocument, type Section } from '../src/corpus/markdown.js';
import { LocalEmbedder } from '../src/embedder.js';
import { saveIndex, type CorpusSource } from '../src/index-store.js';

const ROOT = join(import.meta.dirname, '..');
const CORPUS_DIR = join(ROOT, 'corpus');
const INDEX_PATH = process.env.INDEX_PATH || join(ROOT, 'data', 'index.json');

const source = JSON.parse(await readFile(join(CORPUS_DIR, 'SOURCE.json'), 'utf8').catch(() => {
  throw new Error('corpus/ is empty. Run "npm run fetch-corpus" first.');
})) as CorpusSource;

const files = (await readdir(CORPUS_DIR, { recursive: true }))
  .filter((f) => f.endsWith('.md'))
  .sort();

const sections: Section[] = [];
for (const file of files) {
  const path = relative(CORPUS_DIR, join(CORPUS_DIR, file)).split(sep).join('/');
  const markdown = await readFile(join(CORPUS_DIR, file), 'utf8');
  sections.push(...chunkDocument({ path, markdown }, { baseUrl: source.baseUrl }));
}
console.error(`Chunked ${files.length} docs into ${sections.length} sections. Embedding…`);

// EMBEDDING_MODEL lets you build a comparison index with another profiled model.
const embedder = new LocalEmbedder(process.env.EMBEDDING_MODEL || undefined);
const started = Date.now();
// Embed the title and heading with the text so short sections keep their context.
const vectors = await embedder.embedDocuments(sections.map((s) => `${s.docTitle} — ${s.heading}\n${s.text}`));
console.error(`Embedded ${vectors.length} sections with ${embedder.model} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

await saveIndex(INDEX_PATH, { model: embedder.model, builtAt: new Date().toISOString(), source, sections, vectors });
console.error(`Wrote ${relative(ROOT, INDEX_PATH)}`);

/**
 * Downloads the pinned docs listed in corpus-manifest.ts into corpus/.
 * The docs are Microsoft's (CC BY 4.0), so they are fetched rather than
 * committed to this repo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BASE_URL, COMMIT, DOCS, LICENSE, REPO, REPO_ROOT } from './corpus-manifest.js';

const CORPUS_DIR = join(import.meta.dirname, '..', 'corpus');
const CONCURRENCY = 6;

async function fetchDoc(path: string): Promise<boolean> {
  const url = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${REPO_ROOT}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`  skipped ${path}: HTTP ${response.status}`);
    return false;
  }
  const target = join(CORPUS_DIR, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await response.text());
  return true;
}

const queue = [...DOCS];
let fetched = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      if (await fetchDoc(path)) fetched++;
    }
  }),
);

await writeFile(
  join(CORPUS_DIR, 'SOURCE.json'),
  JSON.stringify({ repo: REPO, commit: COMMIT, license: LICENSE, baseUrl: BASE_URL, fetchedAt: new Date().toISOString() }, null, 2),
);
console.error(`Fetched ${fetched}/${DOCS.length} docs from ${REPO}@${COMMIT.slice(0, 7)} into corpus/`);
if (fetched === 0) process.exit(1);

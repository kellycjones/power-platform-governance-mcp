import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Section } from './corpus/markdown.js';

export interface CorpusSource {
  repo: string;
  commit: string;
  license: string;
  baseUrl: string;
}

export interface SearchIndex {
  model: string;
  builtAt: string;
  source: CorpusSource;
  sections: Section[];
  vectors: Float32Array[];
}

interface IndexFile {
  version: 1;
  model: string;
  dims: number;
  builtAt: string;
  source: CorpusSource;
  sections: Section[];
  /** All vectors concatenated as little-endian float32, base64-encoded (a third the size of a JSON array). */
  vectors: string;
}

export async function saveIndex(path: string, index: SearchIndex): Promise<void> {
  const dims = index.vectors[0]?.length ?? 0;
  const packed = new Float32Array(index.vectors.length * dims);
  index.vectors.forEach((v, i) => packed.set(v, i * dims));
  const file: IndexFile = {
    version: 1,
    model: index.model,
    dims,
    builtAt: index.builtAt,
    source: index.source,
    sections: index.sections,
    vectors: Buffer.from(packed.buffer).toString('base64'),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file));
}

export async function loadIndex(path: string): Promise<SearchIndex> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`No search index at ${path}. Run "npm run setup" first to download the docs and build it.`);
  }
  const file = JSON.parse(raw) as IndexFile;
  if (file.version !== 1) throw new Error(`Unsupported index version ${String(file.version)}; rebuild with "npm run build-index".`);

  const bytes = Buffer.from(file.vectors, 'base64');
  const packed = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const vectors = file.sections.map((_, i) => packed.slice(i * file.dims, (i + 1) * file.dims));
  return { model: file.model, builtAt: file.builtAt, source: file.source, sections: file.sections, vectors };
}

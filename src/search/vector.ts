import type { Ranked } from './bm25.js';

/**
 * Brute-force cosine similarity over normalized embeddings. For a few thousand
 * sections this is well under a millisecond per query, so an ANN library would
 * only add a dependency.
 */
export class VectorIndex {
  constructor(
    private readonly ids: string[],
    private readonly vectors: Float32Array[],
  ) {
    if (ids.length !== vectors.length) {
      throw new Error(`VectorIndex: ${ids.length} ids but ${vectors.length} vectors`);
    }
  }

  search(query: Float32Array, limit: number, filter?: (id: string) => boolean): Ranked[] {
    const results: Ranked[] = [];
    for (let i = 0; i < this.ids.length; i++) {
      const id = this.ids[i]!;
      if (filter && !filter(id)) continue;
      results.push({ id, score: dot(query, this.vectors[i]!) });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

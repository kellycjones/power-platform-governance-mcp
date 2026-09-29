import { identifierTokens, tokenize } from './tokenize.js';

/** How much more an identifier in the query counts than an ordinary word. */
export const IDENTIFIER_BOOST = 3;

export interface Ranked {
  id: string;
  score: number;
}

/**
 * Okapi BM25 keyword index. Small enough to rebuild in memory at startup, so
 * the on-disk index only has to store text and embeddings.
 */
export class Bm25Index {
  private readonly postings = new Map<string, Map<number, number>>();
  private readonly lengths: number[] = [];
  private readonly ids: string[] = [];
  private readonly avgLength: number;

  constructor(
    docs: Iterable<{ id: string; text: string }>,
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    for (const doc of docs) {
      const index = this.ids.length;
      const tokens = tokenize(doc.text);
      this.ids.push(doc.id);
      this.lengths.push(tokens.length);
      for (const token of tokens) {
        let posting = this.postings.get(token);
        if (!posting) this.postings.set(token, (posting = new Map()));
        posting.set(index, (posting.get(index) ?? 0) + 1);
      }
    }
    const total = this.lengths.reduce((sum, n) => sum + n, 0);
    this.avgLength = this.ids.length ? total / this.ids.length : 0;
  }

  get size(): number {
    return this.ids.length;
  }

  search(query: string, limit: number, filter?: (id: string) => boolean): Ranked[] {
    const scores = new Map<number, number>();
    const n = this.ids.length;
    const identifiers = identifierTokens(query);
    for (const term of new Set(tokenize(query))) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const boost = identifiers.has(term) ? IDENTIFIER_BOOST : 1;
      const idf = boost * Math.log(1 + (n - posting.size + 0.5) / (posting.size + 0.5));
      for (const [index, tf] of posting) {
        const norm = 1 - this.b + this.b * (this.lengths[index]! / this.avgLength);
        const score = idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * norm));
        scores.set(index, (scores.get(index) ?? 0) + score);
      }
    }
    return [...scores]
      .map(([index, score]) => ({ id: this.ids[index]!, score }))
      .filter((r) => !filter || filter(r.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

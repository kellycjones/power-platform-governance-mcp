import type { Section } from '../corpus/markdown.js';
import type { Embedder } from '../embedder.js';
import { Bm25Index, type Ranked } from './bm25.js';
import { identifierTokens } from './tokenize.js';
import { VectorIndex } from './vector.js';

export type Retriever = 'keyword' | 'semantic';
export type Weights = Record<Retriever, number>;
export type Fused = { id: string; score: number; matchedBy: Retriever[] };

export interface SearchHit {
  section: Section;
  /** Fused relevance score (higher is better). */
  score: number;
  /** Which retrievers had this section in their candidate pool. */
  matchedBy: Retriever[];
}

export interface SearchOptions {
  limit?: number;
  area?: string;
  /** Use one retriever alone; defaults to both, fused. `npm run eval` compares all three. */
  mode?: 'hybrid' | Retriever;
  /** Fusion method; "relative" (the default) won the evaluation, "rrf" is kept for comparison. */
  fusion?: 'relative' | 'rrf';
  /** Override the fusion weights (for evaluation). */
  weights?: Weights;
}

/**
 * Fusion weights, chosen with `npm run eval` (see README). For plain-English
 * questions, keyword matches count half as much as semantic ones, so loose
 * word overlaps don't crowd out good semantic hits. When the query names an
 * exact identifier (a cmdlet or setting), lexical matching is the reliable
 * signal, so keyword results count double.
 */
export const PROSE_WEIGHTS: Weights = { keyword: 0.5, semantic: 1 };
export const IDENTIFIER_WEIGHTS: Weights = { keyword: 2, semantic: 1 };

export function weightsFor(query: string): Weights {
  return identifierTokens(query).size ? IDENTIFIER_WEIGHTS : PROSE_WEIGHTS;
}

/**
 * Relative score fusion: min-max normalizes each retriever's scores to 0..1
 * within its candidate pool, then takes the weighted sum. Unlike rank fusion
 * it keeps the size of a lead, so a decisive exact-identifier match in BM25
 * isn't flattened into "rank 1" and outvoted.
 */
export function relativeScoreFusion(lists: Record<Retriever, Ranked[]>, weights: Weights): Fused[] {
  return fuse(lists, (ranked) => {
    const max = ranked[0]?.score ?? 0;
    const min = ranked[ranked.length - 1]?.score ?? 0;
    return (hit) => (max === min ? 1 : (hit.score - min) / (max - min));
  }, weights);
}

/** Standard RRF constant from Cormack et al. (2009); dampens the weight of top ranks. */
export const RRF_K = 60;

/**
 * Weighted reciprocal rank fusion: each list contributes weight / (k + rank).
 * The common default for hybrid search; it lost to relative score fusion on
 * this corpus's exact-identifier questions (see README).
 */
export function reciprocalRankFusion(
  lists: Record<Retriever, Ranked[]>,
  weights: Weights = { keyword: 1, semantic: 1 },
  k = RRF_K,
): Fused[] {
  return fuse(lists, () => (_hit, rank) => 1 / (k + rank + 1), weights);
}

function fuse(
  lists: Record<Retriever, Ranked[]>,
  scorer: (ranked: Ranked[]) => (hit: Ranked, rank: number) => number,
  weights: Weights,
): Fused[] {
  const fused = new Map<string, { score: number; matchedBy: Retriever[] }>();
  for (const [retriever, ranked] of Object.entries(lists) as [Retriever, Ranked[]][]) {
    const score = scorer(ranked);
    ranked.forEach((hit, rank) => {
      const entry = fused.get(hit.id) ?? { score: 0, matchedBy: [] };
      entry.score += weights[retriever] * score(hit, rank);
      entry.matchedBy.push(retriever);
      fused.set(hit.id, entry);
    });
  }
  return [...fused].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.score - a.score);
}

/** Keyword (BM25) + semantic (embedding) retrieval, fused into one ranking. */
export class HybridSearcher {
  private readonly byId: Map<string, Section>;
  private readonly bm25: Bm25Index;
  private readonly vectors: VectorIndex;

  constructor(
    readonly sections: Section[],
    vectors: Float32Array[],
    private readonly embedder: Embedder,
    private readonly candidatePool = 40,
  ) {
    this.byId = new Map(sections.map((s) => [s.id, s]));
    // Title and heading are repeated so a match there outweighs a passing mention in the body.
    this.bm25 = new Bm25Index(
      sections.map((s) => ({
        id: s.id,
        text: `${s.docTitle} ${s.heading} ${s.docTitle} ${s.heading} ${s.text}`,
      })),
    );
    this.vectors = new VectorIndex(
      sections.map((s) => s.id),
      vectors,
    );
  }

  get(id: string): Section | undefined {
    return this.byId.get(id);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    const limit = options.limit ?? 5;
    const mode = options.mode ?? 'hybrid';
    const filter = options.area
      ? (id: string) => this.byId.get(id)?.area === options.area
      : undefined;

    const lists: Record<Retriever, Ranked[]> = { keyword: [], semantic: [] };
    if (mode !== 'semantic') lists.keyword = this.bm25.search(query, this.candidatePool, filter);
    if (mode !== 'keyword') {
      lists.semantic = this.vectors.search(await this.embedder.embedQuery(query), this.candidatePool, filter);
    }
    const weights = options.weights ?? weightsFor(query);
    const fused =
      options.fusion === 'rrf' ? reciprocalRankFusion(lists, weights) : relativeScoreFusion(lists, weights);

    return fused.slice(0, limit).map((hit) => ({
      section: this.byId.get(hit.id)!,
      score: hit.score,
      matchedBy: hit.matchedBy,
    }));
  }
}

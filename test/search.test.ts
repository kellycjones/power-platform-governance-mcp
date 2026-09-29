import { describe, expect, it } from 'vitest';
import { Bm25Index } from '../src/search/bm25.js';
import { reciprocalRankFusion, relativeScoreFusion, weightsFor, IDENTIFIER_WEIGHTS, PROSE_WEIGHTS } from '../src/search/hybrid.js';
import { identifierTokens, stem, tokenize } from '../src/search/tokenize.js';
import { VectorIndex } from '../src/search/vector.js';
import { fixtureSearcher } from './helpers.js';

describe('tokenize', () => {
  it('drops stopwords and folds word variants to one key', () => {
    expect(tokenize('How do I block the HTTP connectors?')).toEqual(['block', 'http', 'connector']);
    expect(new Set(['update', 'updates', 'updated', 'updating'].map(stem))).toEqual(new Set(['updat']));
    expect(stem('policies')).toBe(stem('policy'));
    expect(stem('access')).toBe('access');
  });

  it('spots camelCase settings and cmdlet nouns as identifiers', () => {
    expect(identifierTokens('turn off disableAdminDigest')).toEqual(new Set(['disableadmindigest']));
    expect(identifierTokens('what does Get-AdminPowerAppConnectorAction return')).toEqual(
      new Set(['adminpowerappconnectoraction']),
    );
    expect(identifierTokens('Block the HTTP connector').size).toBe(0);
  });
});

describe('Bm25Index', () => {
  const index = new Bm25Index([
    { id: 'a', text: 'Classify the HTTP connector as blocked in a data policy.' },
    { id: 'b', text: 'Environment routing sends new makers to a developer environment.' },
    { id: 'c', text: 'Turn off the weekly digest email. Turn off digests with disableAdminDigest.' },
    { id: 'd', text: 'Turn off auditing. Turn off logging. Turn off retention.' },
  ]);

  it('ranks documents containing the query terms', () => {
    expect(index.search('block http connectors', 5).map((r) => r.id)).toEqual(['a']);
  });

  it('lets an exact identifier outweigh common words', () => {
    expect(index.search('turn off disableAdminDigest', 5)[0]!.id).toBe('c');
  });

  it('applies filters', () => {
    expect(index.search('environment', 5, (id) => id !== 'b')).toEqual([]);
  });
});

describe('VectorIndex', () => {
  it('ranks by cosine similarity of normalized vectors', () => {
    const v = (...xs: number[]) => Float32Array.from(xs);
    const index = new VectorIndex(['x', 'y'], [v(1, 0), v(0, 1)]);
    expect(index.search(v(0.8, 0.6), 2).map((r) => r.id)).toEqual(['x', 'y']);
  });
});

describe('fusion', () => {
  const lists = {
    keyword: [
      { id: 'exact', score: 30 },
      { id: 'both', score: 5 },
      { id: 'kw-only', score: 4 },
    ],
    semantic: [
      { id: 'both', score: 0.8 },
      { id: 'sem-only', score: 0.79 },
      { id: 'sem-only-2', score: 0.78 },
      { id: 'exact', score: 0.5 },
    ],
  };

  it('RRF rewards items both retrievers found and records who found them', () => {
    const fused = reciprocalRankFusion(lists);
    expect(fused[0]!.id).toBe('both');
    expect(fused.find((f) => f.id === 'kw-only')!.matchedBy).toEqual(['keyword']);
  });

  it('score fusion keeps a decisive keyword lead that RRF flattens', () => {
    expect(relativeScoreFusion(lists, IDENTIFIER_WEIGHTS)[0]!.id).toBe('exact');
    expect(reciprocalRankFusion(lists, IDENTIFIER_WEIGHTS)[0]!.id).toBe('both');
  });

  it('weights keyword matches up only when the query names an identifier', () => {
    expect(weightsFor('who can create environments')).toBe(PROSE_WEIGHTS);
    expect(weightsFor('set limitSharingMode')).toBe(IDENTIFIER_WEIGHTS);
  });
});

describe('HybridSearcher', () => {
  it('finds the right section and reports which retrievers matched', async () => {
    const { searcher } = await fixtureSearcher();
    const [top] = await searcher.search('stop makers using the HTTP connector', { limit: 3 });
    expect(top!.section.id).toBe('admin/dlp-connector-classification#1');
    expect(top!.section.url).toMatch(/#block-connectors$/);
    expect(top!.matchedBy).toContain('keyword');
  });

  it('puts an exact setting name first', async () => {
    const { searcher } = await fixtureSearcher();
    const [top] = await searcher.search('what does limitSharingMode do');
    expect(top!.section.docId).toBe('admin/managed-environment-sharing-limits');
  });

  it('filters by area and supports single-retriever modes', async () => {
    const { searcher } = await fixtureSearcher();
    const coe = await searcher.search('inventory of apps and makers', { area: 'coe' });
    expect(coe.every((h) => h.section.area === 'coe')).toBe(true);
    const keywordOnly = await searcher.search('inventory', { mode: 'keyword' });
    expect(keywordOnly.every((h) => h.matchedBy.join() === 'keyword')).toBe(true);
  });
});

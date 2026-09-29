import { chunkDocument, type Section } from '../src/corpus/markdown.js';
import type { Embedder } from '../src/embedder.js';
import { HybridSearcher } from '../src/search/hybrid.js';
import { tokenize } from '../src/search/tokenize.js';

/**
 * Deterministic stand-in for the real model: hashes tokens into a small
 * bag-of-words vector. Tests stay offline and fast, and texts that share
 * words still end up close together.
 */
export class FakeEmbedder implements Embedder {
  readonly model = 'fake-hash-64';

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.vector(t));
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return this.vector(text);
  }

  private vector(text: string): Float32Array {
    const v = new Float32Array(64);
    for (const token of tokenize(text)) {
      let h = 0;
      for (const ch of token) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % 64]! += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}

export const BASE_URL = 'https://learn.microsoft.com/power-platform/';

export const FIXTURE_DOCS = [
  {
    path: 'admin/dlp-connector-classification.md',
    markdown: `---
title: Connector classification
---
# Connector classification

Data policies sort connectors into Business, Non-Business and Blocked groups.

## Block connectors

Classify the HTTP connector as Blocked to stop makers from calling arbitrary web endpoints from apps and flows.

## Custom connectors

Use New-PowerAppPolicyUrlPatterns to classify custom connectors by host URL pattern.
`,
  },
  {
    path: 'admin/managed-environment-sharing-limits.md',
    markdown: `---
title: Limit sharing
---
# Limit sharing

## Sharing rules

Set limitSharingMode to restrict how many people a canvas app can be shared with in a managed environment.
`,
  },
  {
    path: 'guidance/coe/overview.md',
    markdown: `---
title: CoE Starter Kit overview
---
# CoE Starter Kit overview

The Center of Excellence Starter Kit collects inventory of apps, flows and makers across the tenant for governance reporting.
`,
  },
];

export async function fixtureSearcher(): Promise<{ searcher: HybridSearcher; sections: Section[] }> {
  const sections = FIXTURE_DOCS.flatMap((doc) => chunkDocument(doc, { baseUrl: BASE_URL, minChars: 10 }));
  const embedder = new FakeEmbedder();
  const vectors = await embedder.embedDocuments(sections.map((s) => `${s.docTitle} ${s.heading} ${s.text}`));
  return { searcher: new HybridSearcher(sections, vectors, embedder), sections };
}

export const SOURCE = {
  repo: 'MicrosoftDocs/power-platform',
  commit: '0123456789abcdef',
  license: 'CC-BY-4.0',
  baseUrl: BASE_URL,
};

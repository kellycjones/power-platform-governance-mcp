export interface Embedder {
  /** Model id, stored in the index so a mismatched model is caught at startup. */
  readonly model: string;
  /** Embeds passages for the index. Returns one L2-normalized vector per text. */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  /** Embeds a search query (some models expect a query-side instruction). */
  embedQuery(text: string): Promise<Float32Array>;
}

interface ModelProfile {
  pooling: 'cls' | 'mean';
  /** Instruction prepended to queries only (asymmetric retrieval models). */
  queryPrefix: string;
}

/** Models this server has been evaluated with; see eval/ and the README. */
export const MODEL_PROFILES: Record<string, ModelProfile> = {
  'Xenova/bge-small-en-v1.5': {
    pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
  },
  'Xenova/all-MiniLM-L6-v2': { pooling: 'mean', queryPrefix: '' },
};

export const DEFAULT_MODEL = 'Xenova/bge-small-en-v1.5';

type Extractor = (texts: string[], options: object) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Runs a small sentence-embedding model locally with transformers.js (ONNX).
 * No API key or cloud account needed; the model (~35 MB) downloads once and is
 * cached. Swap in Azure OpenAI embeddings by implementing the same interface.
 */
export class LocalEmbedder implements Embedder {
  private extractor: Promise<Extractor> | undefined;
  private readonly profile: ModelProfile;

  constructor(
    readonly model = DEFAULT_MODEL,
    private readonly batchSize = 32,
  ) {
    const profile = MODEL_PROFILES[model];
    if (!profile) throw new Error(`Unknown embedding model "${model}". Known: ${Object.keys(MODEL_PROFILES).join(', ')}`);
    this.profile = profile;
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      vectors.push(...(await this.run(texts.slice(i, i + this.batchSize))));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [vector] = await this.run([this.profile.queryPrefix + text]);
    return vector!;
  }

  private async run(texts: string[]): Promise<Float32Array[]> {
    const extractor = await this.load();
    const output = await extractor(texts, { pooling: this.profile.pooling, normalize: true });
    const dims = output.dims[1]!;
    return texts.map((_, row) => output.data.slice(row * dims, (row + 1) * dims));
  }

  private load(): Promise<Extractor> {
    this.extractor ??= import('@huggingface/transformers').then(
      async ({ pipeline }) => (await pipeline('feature-extraction', this.model, { dtype: 'q8' })) as unknown as Extractor,
    );
    return this.extractor;
  }
}

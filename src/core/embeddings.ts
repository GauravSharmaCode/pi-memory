import { config } from '../config.js';

let _ollamaAvailable: boolean | null = null;

export async function checkOllamaAvailable(): Promise<boolean> {
  if (_ollamaAvailable !== null) return _ollamaAvailable;
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    _ollamaAvailable = res.ok;
  } catch {
    _ollamaAvailable = false;
  }
  return _ollamaAvailable;
}

export async function embed(text: string): Promise<number[] | null> {
  if (!(await checkOllamaAvailable())) return null;
  try {
    const res = await fetch(`${config.ollama.url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollama.embeddingModel, input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!(await checkOllamaAvailable())) return texts.map(() => null);

  // Ollama processes batches via array input
  try {
    const res = await fetch(`${config.ollama.url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollama.embeddingModel, input: texts }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return texts.map(() => null);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding ?? null);
  } catch {
    // Fallback: embed one by one
    return Promise.all(texts.map((t) => embed(t)));
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function parseEmbedding(stored: string | null): number[] | null {
  if (!stored) return null;
  try { return JSON.parse(stored) as number[]; }
  catch { return null; }
}

export function serializeEmbedding(vec: number[]): string {
  return JSON.stringify(vec);
}

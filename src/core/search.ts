import { config } from '../config.js';
import { getDb, dbAll } from './db.js';
import { embed, cosineSimilarity, parseEmbedding } from './embeddings.js';
import { applyTemporalDecay } from './temporal-decay.js';

export type SearchSource = 'all' | 'daily' | 'knowledge' | 'memory' | 'worklog';

export interface SearchResult {
  id:          string;
  path:        string;
  source:      string;
  startLine:   number;
  endLine:     number;
  score:       number;
  vectorScore: number;
  textScore:   number;
  snippet:     string;
  fileMtime:   number;
}

interface ChunkRow {
  id: string;
  path: string;
  source: string;
  start_line: number;
  end_line: number;
  text: string;
  embedding: string | null;
  file_mtime: number;
}

// ── Keyword search via FTS5 (BM25) ────────────────────────────────────────────

function bm25ToScore(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  if (rank < 0) {
    const rel = -rank;
    return rel / (1 + rel);
  }
  return 1 / (1 + rank);
}

function buildFtsQuery(query: string): string | null {
  // Tokenize and quote each term for FTS5 AND matching
  const tokens = query
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' AND ');
}

function sourceFilter(source: SearchSource): string {
  if (source === 'all' || source === 'worklog') return '';
  return ` AND source = '${source}'`;
}

function keywordSearch(query: string, source: SearchSource, limit: number): SearchResult[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const filter = sourceFilter(source);

  let rows: Array<{ id: string; path: string; source: string; start_line: number; end_line: number; text: string; rank: number; file_mtime: number }>;

  try {
    rows = getDb().prepare(`
      SELECT c.id, c.path, c.source, c.start_line, c.end_line, c.text,
             bm25(chunks_fts) AS rank, c.file_mtime
      FROM   chunks_fts
      JOIN   chunks c ON c.id = chunks_fts.id
      WHERE  chunks_fts MATCH ?${filter}
      ORDER  BY rank ASC
      LIMIT  ?
    `).all(ftsQuery, limit * 3) as typeof rows;
  } catch {
    return [];
  }

  return rows.map((r) => ({
    id:          r.id,
    path:        r.path,
    source:      r.source,
    startLine:   r.start_line,
    endLine:     r.end_line,
    score:       bm25ToScore(r.rank),
    vectorScore: 0,
    textScore:   bm25ToScore(r.rank),
    snippet:     r.text.slice(0, 500),
    fileMtime:   r.file_mtime,
  }));
}

// ── Vector search (cosine similarity in JS) ────────────────────────────────────

async function vectorSearch(queryVec: number[], source: SearchSource, limit: number): Promise<SearchResult[]> {
  const filter = sourceFilter(source);

  const rows = getDb().prepare(`
    SELECT id, path, source, start_line, end_line, text, embedding, file_mtime
    FROM   chunks
    WHERE  embedding IS NOT NULL${filter}
  `).all() as unknown as ChunkRow[];

  const scored = rows
    .map((r) => {
      const vec = parseEmbedding(r.embedding);
      if (!vec) return null;
      const sim = cosineSimilarity(queryVec, vec);
      return {
        id:          r.id,
        path:        r.path,
        source:      r.source,
        startLine:   r.start_line,
        endLine:     r.end_line,
        score:       sim,
        vectorScore: sim,
        textScore:   0,
        snippet:     r.text.slice(0, 500),
        fileMtime:   r.file_mtime,
      } as SearchResult;
    })
    .filter((r): r is SearchResult => r !== null && r.score > 0.1);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit * 3);
}

// ── Merge vector + keyword ─────────────────────────────────────────────────────

function mergeResults(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  limit: number,
): SearchResult[] {
  const vw = config.search.vectorWeight;
  const tw = config.search.textWeight;

  const byId = new Map<string, SearchResult>();

  for (const r of vectorResults) {
    byId.set(r.id, { ...r, score: vw * r.vectorScore });
  }
  for (const r of keywordResults) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      existing.score     = vw * existing.vectorScore + tw * r.textScore;
    } else {
      byId.set(r.id, { ...r, score: tw * r.textScore });
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  opts: { maxResults?: number; source?: SearchSource } = {},
): Promise<SearchResult[]> {
  const limit  = opts.maxResults ?? config.search.defaultMaxResults;
  const source = opts.source ?? 'all';

  // Embed query (may return null if Ollama offline → keyword-only)
  const queryVec = await embed(query);

  const [vResults, kResults] = await Promise.all([
    queryVec ? vectorSearch(queryVec, source, limit) : Promise.resolve([]),
    keywordSearch(query, source, limit),
  ]);

  let results: SearchResult[];
  if (vResults.length === 0 && kResults.length > 0) {
    results = kResults.slice(0, limit);
  } else {
    results = mergeResults(vResults, kResults, limit);
  }

  // Apply temporal decay
  results = applyTemporalDecay(results);
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

import { randomUUID } from 'node:crypto';
import { hybridSearch, type SearchSource } from '../core/search.js';
import { SESSION_ID } from '../core/memory-manager.js';
import { getDb, dbTransaction } from '../core/db.js';
import { checkAutoPromote } from './manage.js';

export interface SearchToolInput {
  query:      string;
  maxResults?: number;
  source?:    SearchSource;
}

export interface SearchToolOutput {
  results: Array<{
    path:        string;
    source:      string;
    score:       number;
    snippet:     string;
    startLine:   number;
    endLine:     number;
  }>;
  total:       number;
  ollamaUsed:  boolean;
}

export async function searchMemory(input: SearchToolInput): Promise<SearchToolOutput> {
  const results = await hybridSearch(input.query, {
    maxResults: input.maxResults ?? 5,
    source:     input.source ?? 'all',
  });

  const ollamaUsed = results.some((r) => r.vectorScore > 0);

  // Log recalls for auto-promote tracking
  if (results.length > 0) {
    const db    = getDb();
    const insert = db.prepare(`
      INSERT INTO recall_log (id, chunk_id, session_id, query, recalled_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    dbTransaction(() => {
      for (const r of results) {
        insert.run(randomUUID(), r.id, SESSION_ID, input.query, Date.now());
      }
    });

    // Check if any chunks hit auto-promote threshold (non-blocking)
    checkAutoPromote().catch(() => {/* silent */});
  }

  return {
    results: results.map((r) => ({
      path:      r.path,
      source:    r.source,
      score:     Math.round(r.score * 1000) / 1000,
      snippet:   r.snippet,
      startLine: r.startLine,
      endLine:   r.endLine,
    })),
    total:      results.length,
    ollamaUsed,
  };
}

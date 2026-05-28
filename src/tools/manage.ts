import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { indexAll } from '../core/indexer.js';
import { getDb, dbAll } from '../core/db.js';

// ── Index / Status ────────────────────────────────────────────────────────────

export interface IndexToolInput  { force?: boolean }
export interface IndexToolOutput { files: number; chunks: number; tookMs: number }

export async function indexMemory(input: IndexToolInput = {}): Promise<IndexToolOutput> {
  const start  = Date.now();
  const result = await indexAll(input.force ?? false);
  return { ...result, tookMs: Date.now() - start };
}

export interface StatusOutput {
  workspace:    string;
  totalChunks:  number;
  chunksBySource: Record<string, number>;
  totalWorklog: number;
  indexedFiles: number;
  ollamaModel:  string;
  embeddedChunks: number;
}

export function memoryStatus(): StatusOutput {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }).n;
  const embedded = (db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE embedding IS NOT NULL').get() as { n: number }).n;
  const bySource = dbAll<{ source: string; n: number }>('SELECT source, COUNT(*) AS n FROM chunks GROUP BY source');
  const wlogTotal = (db.prepare('SELECT COUNT(*) AS n FROM worklog').get() as { n: number }).n;
  const fileCount = (db.prepare('SELECT COUNT(DISTINCT path) AS n FROM chunks').get() as { n: number }).n;

  return {
    workspace:      config.workspace.root,
    totalChunks:    total,
    chunksBySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
    totalWorklog:   wlogTotal,
    indexedFiles:   fileCount,
    ollamaModel:    config.ollama.embeddingModel,
    embeddedChunks: embedded,
  };
}

// ── Promote ───────────────────────────────────────────────────────────────────

export interface PromoteToolInput { minScore?: number; dryRun?: boolean }
export interface PromoteToolOutput {
  promoted: Array<{ chunkId: string; path: string; snippet: string }>;
  total:    number;
  dryRun:   boolean;
}

export async function promoteMemory(input: PromoteToolInput = {}): Promise<PromoteToolOutput> {
  const { recallThreshold, lookbackDays } = config.promote;
  const since = Date.now() - lookbackDays * 86_400_000;

  const db = getDb();

  // Find chunks recalled in 3+ distinct sessions within lookback window
  const candidates = db.prepare(`
    SELECT rl.chunk_id, COUNT(DISTINCT rl.session_id) AS session_count
    FROM   recall_log rl
    WHERE  rl.recalled_at > ?
    GROUP  BY rl.chunk_id
    HAVING session_count >= ?
  `).all(since, recallThreshold) as { chunk_id: string; session_count: number }[];

  if (candidates.length === 0) {
    return { promoted: [], total: 0, dryRun: input.dryRun ?? false };
  }

  const promoted: PromoteToolOutput['promoted'] = [];
  const memoryMdPath = path.join(config.workspace.root, 'MEMORY.md');

  for (const { chunk_id } of candidates) {
    // Check not already promoted
    const alreadyPromoted = db.prepare(
      `SELECT value FROM meta WHERE key = ?`
    ).get(`promoted:${chunk_id}`) as { value: string } | undefined;

    if (alreadyPromoted) continue;

    // Only promote daily-source chunks
    const chunk = db.prepare(
      `SELECT id, path, text, source FROM chunks WHERE id = ?`
    ).get(chunk_id) as { id: string; path: string; text: string; source: string } | undefined;

    if (!chunk || chunk.source !== 'daily') continue;

    if (!input.dryRun) {
      // Append to MEMORY.md
      const entry = `\n---\n<!-- promoted from ${chunk.path} -->\n\n${chunk.text.trim()}\n`;
      fs.appendFileSync(memoryMdPath, entry, 'utf8');

      // Mark as promoted
      db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(
        `promoted:${chunk_id}`, new Date().toISOString()
      );
    }

    promoted.push({ chunkId: chunk_id, path: chunk.path, snippet: chunk.text.slice(0, 200) });
  }

  return { promoted, total: promoted.length, dryRun: input.dryRun ?? false };
}

/** Called after every search to check auto-promote threshold (non-blocking). */
export async function checkAutoPromote(): Promise<void> {
  const db = getDb();
  const since = Date.now() - config.promote.lookbackDays * 86_400_000;

  const count = (db.prepare(`
    SELECT COUNT(DISTINCT chunk_id) AS n
    FROM (
      SELECT chunk_id, COUNT(DISTINCT session_id) AS sc
      FROM   recall_log
      WHERE  recalled_at > ?
      GROUP  BY chunk_id
      HAVING sc >= ?
    )
  `).get(since, config.promote.recallThreshold) as { n: number }).n;

  if (count > 0) {
    await promoteMemory({ dryRun: false });
  }
}

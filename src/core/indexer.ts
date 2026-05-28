import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb, dbTransaction } from './db.js';
import { chunkMarkdown } from './chunker.js';
import { embedBatch, serializeEmbedding } from './embeddings.js';

export type MemorySource = 'daily' | 'knowledge' | 'memory';

function resolveSource(filePath: string): MemorySource {
  const rel = path.relative(config.workspace.root, filePath).replace(/\\/g, '/');
  if (rel.startsWith('daily/'))     return 'daily';
  if (rel.startsWith('knowledge/')) return 'knowledge';
  return 'memory';
}

function relPath(filePath: string): string {
  return path.relative(config.workspace.root, filePath).replace(/\\/g, '/');
}

/** Index (or re-index) a single markdown file. */
export async function indexFile(filePath: string): Promise<{ chunksIndexed: number }> {
  if (!fs.existsSync(filePath)) return { chunksIndexed: 0 };

  const stat    = fs.statSync(filePath);
  const mtime   = stat.mtimeMs;
  const relFile = relPath(filePath);
  const source  = resolveSource(filePath);
  const db      = getDb();

  // Check if already indexed and up to date
  const existing = db.prepare('SELECT file_mtime FROM chunks WHERE path = ? LIMIT 1').get(relFile) as
    | { file_mtime: number }
    | undefined;

  if (existing && existing.file_mtime >= mtime) {
    return { chunksIndexed: 0 }; // up to date
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const chunks  = chunkMarkdown(content);
  if (chunks.length === 0) return { chunksIndexed: 0 };

  // Embed all chunks in one batch
  const embeddings = await embedBatch(chunks.map((c) => c.text));

  dbTransaction(() => {
    // Remove old chunks for this file
    const oldChunks = db.prepare('SELECT id FROM chunks WHERE path = ?').all(relFile) as { id: string }[];
    for (const { id } of oldChunks) {
      db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM chunks WHERE path = ?').run(relFile);

    // Insert new chunks
    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, path, source, start_line, end_line, text, embedding, model, indexed_at, file_mtime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = db.prepare(`
      INSERT INTO chunks_fts (id, path, source, text) VALUES (?, ?, ?, ?)
    `);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vec   = embeddings[i];
      const id    = randomUUID();

      insertChunk.run(
        id, relFile, source,
        chunk.startLine, chunk.endLine,
        chunk.text,
        vec ? serializeEmbedding(vec) : null,
        vec ? config.ollama.embeddingModel : null,
        Date.now(), mtime,
      );
      insertFts.run(id, relFile, source, chunk.text);
    }
  });

  return { chunksIndexed: chunks.length };
}

/** Scan workspace dirs and index any new/changed files. */
export async function indexAll(force = false): Promise<{ files: number; chunks: number }> {
  const dirs = [config.workspace.dailyDir, config.workspace.knowledgeDir];
  const memoryMd = path.join(config.workspace.root, 'MEMORY.md');

  const allFiles: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) {
        allFiles.push(path.join(dir, e.name));
      }
    }
  }
  if (fs.existsSync(memoryMd)) allFiles.push(memoryMd);

  if (force) {
    // Clear all chunks for these files
    const db = getDb();
    db.exec('DELETE FROM chunks; DELETE FROM chunks_fts;');
  }

  let totalChunks = 0;
  let totalFiles  = 0;
  for (const file of allFiles) {
    const result = await indexFile(file);
    if (result.chunksIndexed > 0) {
      totalChunks += result.chunksIndexed;
      totalFiles++;
    }
  }

  return { files: totalFiles, chunks: totalChunks };
}

/** Remove all index entries for a deleted file. */
export function removeFile(filePath: string): void {
  const relFile = relPath(filePath);
  const db = getDb();
  const oldChunks = db.prepare('SELECT id FROM chunks WHERE path = ?').all(relFile) as { id: string }[];
  dbTransaction(() => {
    for (const { id } of oldChunks) {
      db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM chunks WHERE path = ?').run(relFile);
  });
}

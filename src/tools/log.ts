import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb, dbTransaction } from '../core/db.js';
import { embed, serializeEmbedding } from '../core/embeddings.js';

export type WorklogType = 'ticket' | 'decision' | 'learning' | 'note';

export interface LogToolInput {
  type:        WorklogType;
  summary:     string;
  ticketId?:   string;
  resolution?: string;
  context?:    string;
  tags?:       string[];
  timeSpent?:  string;
  recurring?:  boolean;
}

export interface LogToolOutput {
  id:       string;
  type:     WorklogType;
  ts:       string;
  summary:  string;
  file:     string;
}

export async function logWork(input: LogToolInput): Promise<LogToolOutput> {
  const id      = randomUUID();
  const ts      = new Date().toISOString();
  const tagsStr = input.tags?.join(',') ?? '';
  const textForEmbed = [input.summary, input.resolution, input.context, tagsStr]
    .filter(Boolean)
    .join(' ');

  const embedding = await embed(textForEmbed);

  // Write to SQLite worklog
  const db = getDb();
  dbTransaction(() => {
    db.prepare(`
      INSERT INTO worklog (id, ts, type, ticket_id, summary, resolution, ctx, tags, time_spent, recurring, embedding, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, ts, input.type,
      input.ticketId ?? null,
      input.summary,
      input.resolution ?? null,
      input.context ?? null,
      tagsStr || null,
      input.timeSpent ?? null,
      input.recurring ? 1 : 0,
      embedding ? serializeEmbedding(embedding) : null,
      embedding ? config.ollama.embeddingModel : null,
    );

    db.prepare(`
      INSERT INTO worklog_fts (id, summary, resolution, tags, type)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, input.summary, input.resolution ?? '', tagsStr, input.type);
  });

  // Also append to daily JSONL worklog file for human readability
  const today     = ts.slice(0, 10);
  const jsonlPath = path.join(config.workspace.worklogDir, `${today}.jsonl`);
  fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });

  const entry = {
    id,
    ts,
    type:       input.type,
    ticketId:   input.ticketId,
    summary:    input.summary,
    resolution: input.resolution,
    context:    input.context,
    tags:       input.tags,
    timeSpent:  input.timeSpent,
    recurring:  input.recurring ?? false,
  };
  fs.appendFileSync(jsonlPath, JSON.stringify(entry) + '\n', 'utf8');

  const relFile = path.relative(config.workspace.root, jsonlPath).replace(/\\/g, '/');
  return { id, type: input.type, ts, summary: input.summary, file: relFile };
}

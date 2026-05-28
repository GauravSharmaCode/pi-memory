import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { indexFile } from '../core/indexer.js';

export interface WriteToolInput {
  text:   string;
  file?:  string;  // relative path in workspace; defaults to today's daily log
}

export interface WriteToolOutput {
  file:      string;
  appended:  number;  // characters written
  indexed:   boolean;
}

function todayDailyPath(): string {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(config.workspace.dailyDir, `${date}.md`);
}

export async function writeMemory(input: WriteToolInput): Promise<WriteToolOutput> {
  let targetPath: string;

  if (input.file) {
    const resolved = path.resolve(config.workspace.root, input.file);
    if (!resolved.startsWith(config.workspace.root)) {
      throw new Error(`Path traversal: ${input.file}`);
    }
    targetPath = resolved;
  } else {
    targetPath = todayDailyPath();
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Prepend timestamp if writing to daily log
  const isDaily = targetPath.startsWith(config.workspace.dailyDir);
  const entry   = isDaily
    ? `\n### ${new Date().toISOString()}\n\n${input.text.trim()}\n`
    : `\n${input.text.trim()}\n`;

  fs.appendFileSync(targetPath, entry, 'utf8');

  // Re-index file
  const { chunksIndexed } = await indexFile(targetPath);

  const relFile = path.relative(config.workspace.root, targetPath).replace(/\\/g, '/');
  return {
    file:     relFile,
    appended: entry.length,
    indexed:  chunksIndexed > 0,
  };
}

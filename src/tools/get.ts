import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface GetToolInput {
  path:   string;  // relative to workspace root
  from?:  number;  // line number to start from (1-indexed)
  lines?: number;  // number of lines to return
}

export interface GetToolOutput {
  path:     string;
  content:  string;
  totalLines: number;
  from:     number;
  returned: number;
}

export function getMemoryFile(input: GetToolInput): GetToolOutput {
  // Resolve path safely (no traversal outside workspace)
  const resolved = path.resolve(config.workspace.root, input.path);
  if (!resolved.startsWith(config.workspace.root)) {
    throw new Error(`Path traversal detected: ${input.path}`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${input.path}`);
  }

  const raw        = fs.readFileSync(resolved, 'utf8');
  const allLines   = raw.split('\n');
  const totalLines = allLines.length;
  const from       = Math.max(1, input.from ?? 1);
  const count      = input.lines ?? totalLines;

  const slice    = allLines.slice(from - 1, from - 1 + count);
  const content  = slice.join('\n');

  return {
    path:       input.path,
    content,
    totalLines,
    from,
    returned:   slice.length,
  };
}

/** List all files in a memory directory. */
export function listMemoryFiles(subdir?: string): string[] {
  const base = subdir
    ? path.join(config.workspace.root, subdir)
    : config.workspace.root;

  if (!fs.existsSync(base)) return [];

  const results: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.jsonl')) {
        results.push(path.relative(config.workspace.root, path.join(dir, entry.name)));
      }
    }
  }
  walk(base);
  return results.sort();
}

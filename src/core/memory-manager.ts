import { randomUUID } from 'node:crypto';
import { indexAll } from './indexer.js';
import { startWatcher, stopWatcher } from './watcher.js';
import { closeDb } from './db.js';
import { ensureWorkspaceDirs } from '../config.js';

export const SESSION_ID = randomUUID();

let _initialized = false;

/**
 * Initialize memory manager:
 * 1. Ensure workspace dirs exist
 * 2. Run incremental index (stale files only, unless force=true)
 * 3. Start file watcher (if watch=true, i.e., in MCP server mode)
 */
export async function init(opts: { watch?: boolean; force?: boolean } = {}): Promise<void> {
  if (_initialized && !opts.force) return;

  ensureWorkspaceDirs();
  await indexAll(opts.force ?? false);

  if (opts.watch) {
    startWatcher();
  }

  _initialized = true;
}

/** Graceful shutdown (MCP server use). */
export async function shutdown(): Promise<void> {
  await stopWatcher();
  closeDb();
}

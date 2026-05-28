import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import { config } from '../config.js';
import { indexFile, removeFile } from './indexer.js';

let _watcher: FSWatcher | null = null;

export function startWatcher(): FSWatcher {
  if (_watcher) return _watcher;

  const watched = [
    config.workspace.dailyDir,
    config.workspace.knowledgeDir,
    path.join(config.workspace.root, 'MEMORY.md'),
  ];

  _watcher = chokidar.watch(watched, {
    persistent:         true,
    ignoreInitial:      true,
    awaitWriteFinish:   { stabilityThreshold: 500, pollInterval: 100 },
    ignored:            /[/\\]\./,
  });

  const onAddOrChange = (filePath: string) => {
    if (!filePath.endsWith('.md')) return;
    indexFile(filePath).catch((e) =>
      console.error(`[pi-memory] Indexing error for ${filePath}:`, e)
    );
  };

  _watcher
    .on('add',    onAddOrChange)
    .on('change', onAddOrChange)
    .on('unlink', (filePath) => {
      if (!filePath.endsWith('.md')) return;
      removeFile(filePath);
    });

  return _watcher;
}

export async function stopWatcher(): Promise<void> {
  if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }
}

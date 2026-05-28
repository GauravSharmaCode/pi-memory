#!/usr/bin/env node
/**
 * pi-memory CLI
 * Usage: pi-memory <command> [options]
 */

import { init } from './core/memory-manager.js';
import { searchMemory } from './tools/search.js';
import { getMemoryFile, listMemoryFiles } from './tools/get.js';
import { writeMemory } from './tools/write.js';
import { logWork, type WorklogType } from './tools/log.js';
import { queryMemory } from './tools/query.js';
import { indexMemory, memoryStatus, promoteMemory } from './tools/manage.js';
import { ensureWorkspaceDirs, config } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

// ── Arg helpers ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function flag(name: string, defaultVal = false): boolean {
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1) { argv.splice(idx, 1); return true; }
  return defaultVal;
}

function opt(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1]) {
    const val = argv[idx + 1];
    argv.splice(idx, 2);
    return val;
  }
  return undefined;
}

function positional(n: number): string | undefined {
  return argv[n];
}

function rest(from: number): string {
  return argv.slice(from).join(' ');
}

// ── Output helpers ────────────────────────────────────────────────────────────

const jsonOut = flag('json');

function out(data: unknown): void {
  if (jsonOut || typeof data !== 'string') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

function err(msg: string): never {
  console.error(`[pi-memory] Error: ${msg}`);
  process.exit(1);
}

// ── Commands ──────────────────────────────────────────────────────────────────

const command = positional(0);

async function main(): Promise<void> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'init') {
    ensureWorkspaceDirs();
    const memoryMd = path.join(config.workspace.root, 'MEMORY.md');
    const profileMd = path.join(config.workspace.root, 'profile.md');
    if (!fs.existsSync(memoryMd)) fs.writeFileSync(memoryMd, '# Memory\n\n', 'utf8');
    if (!fs.existsSync(profileMd)) fs.writeFileSync(profileMd, '# Profile\n\n', 'utf8');
    out(`Workspace initialized at: ${config.workspace.root}`);
    return;
  }

  // All other commands need the index initialized
  await init({ watch: false, force: false });

  switch (command) {
    // ── search ────────────────────────────────────────────────────────────────
    case 'search': {
      const query = rest(1);
      if (!query) err('Usage: pi-memory search <query>');
      const maxResults = opt('max-results') ? parseInt(opt('max-results')!) : 5;
      const source = (opt('source') as any) ?? 'all';
      const result = await searchMemory({ query, maxResults, source });
      if (jsonOut) { out(result); break; }
      if (result.results.length === 0) { console.log('No results found.'); break; }
      for (const r of result.results) {
        console.log(`\n📄 ${r.path} (score: ${r.score.toFixed(3)}) [${r.source}]`);
        console.log(`   ${r.snippet.replace(/\n/g, '\n   ').slice(0, 300)}`);
      }
      if (!result.ollamaUsed) console.log('\n⚠️  Keyword-only (Ollama offline)');
      break;
    }

    // ── get ───────────────────────────────────────────────────────────────────
    case 'get': {
      const filePath = positional(1);
      if (!filePath) err('Usage: pi-memory get <path> [--from N] [--lines N]');
      const from  = opt('from')  ? parseInt(opt('from')!)  : undefined;
      const lines = opt('lines') ? parseInt(opt('lines')!) : undefined;
      const result = getMemoryFile({ path: filePath, from, lines });
      if (jsonOut) { out(result); break; }
      console.log(result.content);
      break;
    }

    // ── list ──────────────────────────────────────────────────────────────────
    case 'list': {
      const subdir = positional(1);
      const files  = listMemoryFiles(subdir);
      if (jsonOut) { out(files); break; }
      files.forEach((f) => console.log(f));
      break;
    }

    // ── write ─────────────────────────────────────────────────────────────────
    case 'write': {
      const file = opt('file');
      const text = rest(1);
      if (!text) err('Usage: pi-memory write <text> [--file path]');
      const result = await writeMemory({ text, file });
      if (jsonOut) { out(result); break; }
      console.log(`✅ Written to ${result.file} (${result.appended} chars)`);
      break;
    }

    // ── log ───────────────────────────────────────────────────────────────────
    case 'log': {
      const type = (positional(1) as WorklogType) ?? 'note';
      const summary    = opt('summary') ?? rest(2);
      if (!summary) err('Usage: pi-memory log <ticket|decision|learning|note> --summary "..."');
      const ticketId   = opt('id');
      const resolution = opt('resolution');
      const context    = opt('context');
      const tags       = opt('tags')?.split(',').map((t) => t.trim());
      const timeSpent  = opt('time');
      const recurring  = flag('recurring');
      const result = await logWork({ type, summary, ticketId, resolution, context, tags, timeSpent, recurring });
      if (jsonOut) { out(result); break; }
      console.log(`✅ Logged [${result.type}] ${result.id.slice(0, 8)} → ${result.file}`);
      break;
    }

    // ── query ─────────────────────────────────────────────────────────────────
    case 'query': {
      const question = rest(1);
      if (!question) err('Usage: pi-memory query "<question>"');
      const result = await queryMemory({ question });
      if (jsonOut) { out(result); break; }
      console.log(`\n[${result.queryType}]\n\n${result.answer}`);
      break;
    }

    // ── index ─────────────────────────────────────────────────────────────────
    case 'index': {
      const force = flag('force');
      console.log('Indexing...');
      const result = await indexMemory({ force });
      if (jsonOut) { out(result); break; }
      console.log(`✅ Indexed ${result.chunks} chunks from ${result.files} files in ${result.tookMs}ms`);
      break;
    }

    // ── status ────────────────────────────────────────────────────────────────
    case 'status': {
      const status = memoryStatus();
      if (jsonOut) { out(status); break; }
      console.log(`Workspace:  ${status.workspace}`);
      console.log(`Model:      ${status.ollamaModel}`);
      console.log(`Chunks:     ${status.totalChunks} (${status.embeddedChunks} embedded)`);
      console.log(`Files:      ${status.indexedFiles}`);
      console.log(`Worklog:    ${status.totalWorklog} entries`);
      console.log(`By source:  ${JSON.stringify(status.chunksBySource)}`);
      break;
    }

    // ── promote ───────────────────────────────────────────────────────────────
    case 'promote': {
      const dryRun = flag('dry-run');
      const result = await promoteMemory({ dryRun });
      if (jsonOut) { out(result); break; }
      if (result.total === 0) { console.log('Nothing to promote.'); break; }
      console.log(`${dryRun ? '[DRY RUN] ' : ''}Promoted ${result.total} chunks to MEMORY.md:`);
      result.promoted.forEach((p) => console.log(`  • ${p.path}: ${p.snippet.slice(0, 80)}...`));
      break;
    }

    default:
      err(`Unknown command: ${command}. Run 'pi-memory help' for usage.`);
  }
}

function printUsage(): void {
  console.log(`
pi-memory — Personal memory & work journal for AI agents

COMMANDS:
  init                              Initialize workspace at ~/.memory
  search <query>                    Semantic search across all memory
    --max-results N                 Number of results (default: 5)
    --source all|daily|knowledge    Filter by source
  get <path>                        Read a memory file
    --from N  --lines N             Optional line range
  list [subdir]                     List memory files
  write <text>                      Append to today's daily log
    --file <path>                   Write to specific file
  log <ticket|decision|learning|note>
    --summary "..."                 (required)
    --id TKT-123                    Ticket ID (for tickets)
    --resolution "..."
    --context "..."
    --tags "tag1,tag2"
    --time "25m"
    --recurring                     Flag as recurring issue
  query "<question>"                Meta-query (stats, recurring, timeline)
  index [--force]                   (Re)index all memory files
  status                            Show index statistics
  promote [--dry-run]               Promote recalled chunks to MEMORY.md

FLAGS:
  --json                            Output JSON instead of human-readable text

ENVIRONMENT:
  MEMORY_WORKSPACE                  Override workspace path (default: ~/.memory)
  OLLAMA_URL                        Ollama base URL (default: http://localhost:11434)
  EMBEDDING_MODEL                   Model name (default: granite-embedding)
`);
}

main().catch((e) => {
  console.error('[pi-memory]', e instanceof Error ? e.message : e);
  process.exit(1);
});

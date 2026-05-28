# pi-memory — Implementation Plan

> Personal memory & work-journal system for AI agents.  
> Agent-agnostic. Two transports: CLI (bash) + MCP (stdio).  
> Local embeddings via Ollama. SQLite hybrid search.  
> Author: Gaurav Sharma

---

## 1. Project Structure

```
pi-memory/
├── .github/
│   └── README.md                    # GitHub landing page
├── docs/
│   ├── architecture.md              # How it works internally
│   ├── configuration.md             # Config options, env vars
│   ├── cli-reference.md             # CLI command reference
│   ├── mcp-reference.md             # MCP tool schemas
│   └── agent-integration.md         # How to wire into any agent
│
├── plugin/                          # Universal plugin package (agent-agnostic)
│   ├── plugin.json                  # Plugin metadata (works for Antigravity/Cursor/Claude)
│   ├── mcp_config.json              # MCP server definition (points to dist/mcp-server.js)
│   ├── skills/
│   │   └── pi-memory/
│   │       ├── SKILL.md             # Universal skill: when/how to use memory
│   │       └── references/
│   │           └── tools.md         # Tool reference for the agent
│   └── README.md                    # Plugin installation guide
│
├── src/                             # Core tool source
│   ├── cli.ts                       # CLI entry point (bash transport)
│   ├── mcp-server.ts                # MCP stdio server
│   ├── core/
│   │   ├── memory-manager.ts        # Orchestrator
│   │   ├── indexer.ts               # Chunk + index markdown into SQLite
│   │   ├── search.ts                # Hybrid search: vector + FTS5 + decay
│   │   ├── embeddings.ts            # Ollama /v1/embeddings client
│   │   ├── chunker.ts               # Split markdown → semantic chunks
│   │   ├── db.ts                    # SQLite schema, open/close, migrations
│   │   └── temporal-decay.ts        # Recency scoring
│   ├── tools/                       # Tool implementations (shared by CLI + MCP)
│   │   ├── search.ts                # memory_search
│   │   ├── get.ts                   # memory_get
│   │   ├── write.ts                 # memory_write
│   │   ├── log.ts                   # memory_log (structured work entries)
│   │   ├── query.ts                 # memory_query (meta: stats, recurring, timeline)
│   │   ├── index.ts                 # memory_index (reindex/status)
│   │   └── promote.ts              # memory_promote (daily → MEMORY.md)
│   └── config.ts                    # Paths, ollama URL, model, workspace
│
├── package.json
├── tsconfig.json
├── LICENSE                          # MIT
└── README.md                        # → docs/ for detail
```

---

## 2. Plugin Format (Universal)

### `plugin/plugin.json`

```json
{
  "name": "pi-memory",
  "description": "Personal memory and work-journal system for AI agents. Semantic search over your knowledge, decisions, and work history.",
  "version": "0.1.0",
  "author": { "name": "Gaurav Sharma" },
  "repository": "https://github.com/gaurav/pi-memory",
  "license": "MIT",
  "components": ["skills", "mcpServers"],
  "requires": {
    "runtime": "node >= 22",
    "services": ["ollama"]
  }
}
```

### `plugin/mcp_config.json`

```json
{
  "mcpServers": {
    "pi-memory": {
      "command": "node",
      "args": ["${PLUGIN_DIR}/../dist/mcp-server.js"],
      "env": {
        "MEMORY_WORKSPACE": "${HOME}/.memory",
        "OLLAMA_URL": "http://localhost:11434",
        "EMBEDDING_MODEL": "granite-embedding"
      }
    }
  }
}
```

### Agent Installation Matrix

| Agent | How to install |
|-------|---------------|
| **Pi** | Copy `plugin/skills/pi-memory/` → `~/.agents/skills/pi-memory/` |
| **Claude Code** | Copy `plugin/` → `~/.claude/plugins/pi-memory/` |
| **Cursor** | Copy `plugin/` → `~/.cursor/plugins/pi-memory/` |
| **Antigravity** | Copy `plugin/` → `~/.gemini/antigravity-cli/plugins/pi-memory/` |
| **Any MCP client** | Add `mcp_config.json` entry to client config |
| **Any bash agent** | Call `pi-memory <command>` directly |

One plugin, all agents. The skill file is markdown — every agent reads markdown.

---

## 3. Skill File (`plugin/skills/pi-memory/SKILL.md`)

```markdown
---
name: pi-memory
description: >-
  Personal memory and work-journal system. Use to recall project context,
  log work (tickets, decisions, learnings), detect recurring issues, and
  answer meta-questions about past work. Always search memory before
  asking the user for context they may have already provided in past sessions.
  
  Triggers: any domain-specific question, "what did I work on", "is this recurring",
  ticket investigation, needing project/infra context, after resolving an issue
  (to log it), when the user says "remember this" or "add to memory".
---

# pi-memory — Agent Memory & Work Journal

## When to Use

**SEARCH before answering** when:
- User asks about their projects, infrastructure, conventions
- User shows a ticket/issue that might be recurring
- You need context about repos, DB schema, deployment, team decisions
- User asks "what did I work on", "how many tickets", "is this recurring"

**WRITE after** when:
- A ticket/issue is resolved → log it
- A decision is made → record it
- Something new is learned → capture it
- User says "remember this" / "add to memory"

## Tools Available

### Via CLI (bash)
\```bash
pi-memory search "<query>"                    # Semantic search
pi-memory get <path>                          # Read specific file
pi-memory write "<text>"                      # Append to today's daily log
pi-memory write --file knowledge/foo.md "<text>"  # Append to specific file
pi-memory log ticket --id X --summary "..." --resolution "..."
pi-memory log decision --summary "..." --context "..."
pi-memory log learning --summary "..." --tags "a,b,c"
pi-memory query "how many tickets this week"
pi-memory query "is august sync a recurring issue"
pi-memory index
pi-memory status
pi-memory promote
\```

### Via MCP (if connected as MCP server)
Tools: `memory_search`, `memory_get`, `memory_write`, `memory_log`, `memory_query`, `memory_index`, `memory_promote`

## Tool Reference

See [references/tools.md](references/tools.md) for full parameter schemas.

## Workflow

1. **Start of conversation**: If domain context is needed, `search` first
2. **During work**: Use `get` to load specific knowledge files
3. **After resolution**: `log` the outcome (ticket/decision/learning)
4. **User request**: `write` anything they want remembered

## Output Format

Search returns JSON:
\```json
[
  { "path": "knowledge/access-code-lifecycle.md", "score": 0.87, "snippet": "..." },
  { "path": "daily/2026-05-25.md", "score": 0.72, "snippet": "..." }
]
\```

Use the snippets to inform your response. Load full files with `get` if snippets aren't enough.
```

---

## 4. Memory Workspace Layout (`~/.memory/`)

```
~/.memory/
├── config.json              # User config (ollama model, workspace paths)
├── MEMORY.md                # Curated long-term memory (promoted)
├── profile.md               # Engineering profile (agent-ready)
├── daily/                   # Raw session logs (auto-indexed)
│   ├── 2026-05-27.md
│   └── ...
├── knowledge/               # Persistent reference docs (manual + promoted)
│   ├── lynx-architecture.md
│   ├── db-schema.md
│   ├── access-code-lifecycle.md
│   ├── infra.md
│   └── ...
├── worklog/                 # Structured entries (JSONL, queryable)
│   ├── 2026-05-27.jsonl
│   └── ...
└── index/
    └── memory.db            # SQLite: FTS5 + embeddings + metadata
```

---

## 5. Core Implementation Details

### SQLite Schema (`src/core/db.ts`)

```sql
-- Chunks: indexed content from all markdown files
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,          -- relative to workspace
  source TEXT NOT NULL,        -- 'daily' | 'knowledge' | 'memory' | 'worklog'
  start_line INTEGER,
  end_line INTEGER,
  text TEXT NOT NULL,
  embedding BLOB,             -- float32 array
  model TEXT,                 -- embedding model used
  indexed_at INTEGER,         -- unix ms
  file_mtime INTEGER          -- file modification time (for incremental sync)
);

-- FTS5 full-text search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  id UNINDEXED, path, text, source,
  content=chunks, content_rowid=rowid,
  tokenize='unicode61'
);

-- Work log entries (structured)
CREATE TABLE worklog (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,            -- ISO timestamp
  type TEXT NOT NULL,          -- 'ticket' | 'decision' | 'learning' | 'note'
  ticket_id TEXT,
  summary TEXT NOT NULL,
  resolution TEXT,
  context TEXT,
  tags TEXT,                   -- comma-separated
  time_spent TEXT,
  recurring INTEGER DEFAULT 0,
  embedding BLOB,
  model TEXT
);

-- Work log FTS
CREATE VIRTUAL TABLE worklog_fts USING fts5(
  id UNINDEXED, summary, resolution, tags, type,
  content=worklog, content_rowid=rowid,
  tokenize='unicode61'
);

-- Metadata
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### Embedding Client (`src/core/embeddings.ts`)

```typescript
// ~30 lines. That's the entire embedding layer.
const OLLAMA_URL = config.ollamaUrl; // default: http://localhost:11434
const MODEL = config.embeddingModel; // default: granite-embedding

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const json = await res.json();
  return json.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Ollama supports batch via array input
  const res = await fetch(`${OLLAMA_URL}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`Batch embedding failed: ${res.status}`);
  const json = await res.json();
  return json.data.map((d: any) => d.embedding);
}
```

### Hybrid Search (`src/core/search.ts`)

```typescript
// Weighted merge: vector similarity + BM25 keyword + temporal decay
export async function hybridSearch(query: string, opts: SearchOptions): Promise<SearchResult[]> {
  const queryVec = await embed(query);
  
  // 1. Vector search (cosine similarity)
  const vectorResults = searchByVector(db, queryVec, opts.maxResults * 3);
  
  // 2. Keyword search (FTS5 BM25)
  const keywordResults = searchByKeyword(db, query, opts.maxResults * 3);
  
  // 3. Merge with weights
  const merged = mergeResults(vectorResults, keywordResults, {
    vectorWeight: 0.7,
    textWeight: 0.3,
  });
  
  // 4. Apply temporal decay (recent memories score higher)
  const decayed = applyTemporalDecay(merged, { halfLifeDays: 30 });
  
  // 5. Return top-N
  return decayed.slice(0, opts.maxResults);
}
```

### MCP Server (`src/mcp-server.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { searchTool, getTool, writeTool, logTool, queryTool, indexTool, promoteTool } from "./tools";

const server = new McpServer({ name: "pi-memory", version: "0.1.0" });

server.registerTool("memory_search", {
  description: "Semantic search across all memory (knowledge, daily logs, work history)",
  inputSchema: z.object({
    query: z.string().describe("Natural language search query"),
    maxResults: z.number().optional().default(5),
    source: z.enum(["all", "knowledge", "daily", "worklog"]).optional().default("all"),
  }),
}, searchTool.handler);

server.registerTool("memory_get", { /* ... */ }, getTool.handler);
server.registerTool("memory_write", { /* ... */ }, writeTool.handler);
server.registerTool("memory_log", { /* ... */ }, logTool.handler);
server.registerTool("memory_query", { /* ... */ }, queryTool.handler);
server.registerTool("memory_index", { /* ... */ }, indexTool.handler);
server.registerTool("memory_promote", { /* ... */ }, promoteTool.handler);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### CLI (`src/cli.ts`)

```typescript
#!/usr/bin/env node
// Same tool implementations, different transport
const [,, command, ...args] = process.argv;

switch (command) {
  case "search": /* call searchTool, print JSON */ break;
  case "get":    /* call getTool, print content */ break;
  case "write":  /* call writeTool */ break;
  case "log":    /* call logTool */ break;
  case "query":  /* call queryTool */ break;
  case "index":  /* call indexTool */ break;
  case "status": /* call indexTool with status flag */ break;
  case "promote":/* call promoteTool */ break;
  default: printUsage();
}
```

---

## 6. `memory_query` — The Meta-Query Engine

This is what makes it a work journal, not just a docs store.

```typescript
// Structured queries over worklog
type QueryType = 
  | "ticket_count"       // "how many tickets this week/month"
  | "recurring_check"    // "is X a recurring issue"
  | "timeline"           // "what did I work on yesterday/this week"
  | "pattern_detect"     // "what patterns am I seeing"
  | "time_spent"         // "how much time on X"
  | "freeform";          // falls back to hybrid search over worklog

// The tool parses natural language → determines query type → runs SQL/search
// Examples:
// "how many tickets this week" → SELECT COUNT(*) FROM worklog WHERE type='ticket' AND ts > ?
// "is august sync recurring"   → search worklog by tags/summary, count occurrences
// "what did I work on friday"  → SELECT * FROM worklog WHERE date(ts) = '2026-05-23'
```

---

## 7. Build Phases

| Phase | Deliverable | Estimate |
|-------|-------------|----------|
| **P1** | Project scaffold, config, SQLite schema, ollama embeddings | 30 min |
| **P2** | Chunker + indexer (markdown → SQLite chunks + embeddings) | 45 min |
| **P3** | Hybrid search (vector + FTS5 + temporal decay) | 45 min |
| **P4** | CLI transport (all commands working) | 30 min |
| **P5** | MCP server transport | 30 min |
| **P6** | Work log + meta-query engine | 45 min |
| **P7** | Plugin package (skill, mcp_config, plugin.json) | 15 min |
| **P8** | Docs (README, architecture, CLI ref, MCP ref, integration guide) | 30 min |
| **P9** | Seed workspace with your knowledge (AGENTS.md, schema, infra, profile) | 15 min |
| **P10** | Git init, LICENSE, .gitignore, push | 5 min |

**Total: ~5 hours of focused work**

---

## 8. Dependencies

```json
{
  "name": "pi-memory",
  "version": "0.1.0",
  "type": "module",
  "bin": { "pi-memory": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "mcp": "tsx src/mcp-server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.12.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.8.0"
  }
}
```

4 runtime deps. Node built-in `fetch` for ollama. That's it.

---

## 9. Configuration (`~/.memory/config.json`)

```json
{
  "ollama": {
    "url": "http://localhost:11434",
    "embeddingModel": "granite-embedding"
  },
  "search": {
    "vectorWeight": 0.7,
    "textWeight": 0.3,
    "temporalDecay": { "enabled": true, "halfLifeDays": 30 },
    "maxResults": 10
  },
  "workspace": {
    "root": "~/.memory",
    "watchForChanges": true
  }
}
```

---

## 10. Open Questions (for your review)

1. **Embedding model choice**: `granite-embedding` (62MB, fast) vs `qwen3-embedding:0.6b` (639MB, potentially better quality) vs `embeddinggemma` (621MB). Want to benchmark or just start with granite?

2. **Work log format**: JSONL per day (proposed) vs single `worklog.jsonl` file? Per-day is cleaner for temporal queries.

3. **Auto-indexing**: Watch filesystem for changes (chokidar) or manual `pi-memory index` only? Auto is better UX but adds complexity.

4. **Promote strategy**: Manual only, or auto-promote after N recalls of the same snippet (like OpenClaw's dreaming)?

5. **Package name on npm**: `pi-memory`? `agent-memory`? `@gaurav/memory`? (for global install via `npm i -g`)

6. **Seed content**: Should I port your existing AGENTS.md + db-schema + joins into `~/.memory/knowledge/` as part of Phase 9?

---

## Ready to Build

Once you confirm (or adjust) this plan, I'll execute P1 through P10 in sequence. Each phase produces working, testable output.

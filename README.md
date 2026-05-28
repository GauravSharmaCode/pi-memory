# pi-memory

> Personal memory and work-journal system for AI agents.  
> Agent-agnostic · CLI + MCP transports · Local embeddings via Ollama · SQLite hybrid search

---

## What it is

`pi-memory` is a persistent memory layer you install once and any AI agent can use — via bash or MCP. It's not just code context: it's a **work journal** that knows what you've worked on, what issues recur, and what decisions you've made.

```bash
# Agent searches before answering
pi-memory search "august lock code sync failing after checkin"

# Agent logs after resolving
pi-memory log ticket --id TKT-4521 --summary "August sync timeout" \
  --resolution "SQS backpressure during peak checkin" --tags "august,sync,sqs"

# Agent answers meta-questions
pi-memory query "is august sync timeout a recurring issue"
pi-memory query "how many tickets did I resolve this week"
pi-memory query "what did I work on yesterday"
```

## Features

- **Hybrid search** — vector cosine similarity + BM25 full-text, merged with temporal decay
- **Local embeddings** — Ollama (`granite-embedding`, `qwen3-embedding`, or any model). Falls back to keyword-only if Ollama is offline.
- **Two transports** — CLI for bash-based agents; MCP stdio server for Claude Desktop, Cursor, Antigravity, and any MCP client
- **Work journal** — structured logging for tickets, decisions, learnings, notes
- **Meta-queries** — "how many tickets this week?", "is X recurring?", "what did I work on?"
- **Auto-index** — file watcher re-indexes markdown changes automatically
- **Auto-promote** — frequently-recalled daily log snippets are automatically promoted to `MEMORY.md`
- **Universal plugin** — one `plugin/` directory works across Pi, Claude Code, Cursor, and Antigravity

## Architecture

```
pi-memory/
├── src/
│   ├── cli.ts              CLI transport (bash)
│   ├── mcp-server.ts       MCP stdio transport
│   ├── core/               Engine: indexer, search, embeddings, watcher
│   └── tools/              Tool implementations (shared by both transports)
├── plugin/                 Universal agent plugin
│   ├── plugin.json         Metadata
│   ├── mcp_config.json     MCP server registration
│   └── skills/pi-memory/   SKILL.md + references/
└── docs/                   Full documentation
```

**Storage**: `~/.memory/`
```
~/.memory/
├── MEMORY.md               Curated long-term memory (auto-promoted)
├── daily/YYYY-MM-DD.md     Daily session logs
├── knowledge/              Reference docs (architecture, schema, infra)
├── worklog/YYYY-MM-DD.jsonl Structured work entries
└── index/memory.db         SQLite (FTS5 + embeddings)
```

## Install

**Requirements**: Node.js ≥ 22, Ollama (optional, for semantic search)

```bash
git clone https://github.com/GauravSharmaCode/pi-memory
cd pi-memory
npm install
npm run build
npm link         # makes `pi-memory` available globally
pi-memory init   # initialize ~/.memory workspace
```

## Agent Integration

### Pi / Claude Code / Cursor / Antigravity (skill)

Copy the skill to your agent's skills directory:

```bash
# Pi / Universal
cp -r plugin/skills/pi-memory ~/.agents/skills/

# Claude Code
cp -r plugin/skills/pi-memory ~/.claude/skills/

# Cursor
cp -r plugin/skills/pi-memory ~/.cursor/skills/
```

### MCP Server (Claude Desktop, Cursor, Antigravity, any MCP client)

Add to your MCP config:

```json
{
  "mcpServers": {
    "pi-memory": {
      "command": "node",
      "args": ["/path/to/pi-memory/dist/mcp-server.js"],
      "env": {
        "MEMORY_WORKSPACE": "/Users/you/.memory",
        "OLLAMA_URL": "http://localhost:11434",
        "EMBEDDING_MODEL": "granite-embedding"
      }
    }
  }
}
```

## CLI Reference

```bash
pi-memory init                          Initialize workspace
pi-memory search "<query>"              Semantic search
  --max-results N                       Results count (default: 5)
  --source all|daily|knowledge|worklog  Filter source
pi-memory get <path>                    Read memory file
  --from N --lines N                    Line range
pi-memory list [subdir]                 List files
pi-memory write "<text>"               Append to daily log
  --file <path>                         Write to specific file
pi-memory log <ticket|decision|learning|note>
  --summary "..."                       Required
  --id TKT-123                          Ticket ID
  --resolution "..."
  --tags "tag1,tag2"
  --time "25m"
  --recurring
pi-memory query "<question>"           Meta-queries
pi-memory index [--force]              Reindex files
pi-memory status                       Index statistics
pi-memory promote [--dry-run]          Promote to MEMORY.md

# All commands: add --json for structured JSON output
```

## MCP Tools

`memory_search` · `memory_get` · `memory_write` · `memory_log` · `memory_query` · `memory_index` · `memory_status` · `memory_promote`

See [docs/mcp-reference.md](docs/mcp-reference.md) for full schemas.

## Configuration

`~/.memory/config.json`:
```json
{
  "ollama": {
    "url": "http://localhost:11434",
    "embeddingModel": "granite-embedding"
  },
  "search": {
    "vectorWeight": 0.7,
    "textWeight": 0.3,
    "defaultMaxResults": 10,
    "temporalDecayHalfLifeDays": 30
  },
  "promote": {
    "recallThreshold": 3,
    "lookbackDays": 7
  }
}
```

Environment variables: `MEMORY_WORKSPACE`, `OLLAMA_URL`, `EMBEDDING_MODEL`

## License

MIT © Gaurav Sharma

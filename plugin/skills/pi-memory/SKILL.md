---
name: pi-memory
description: >-
  Personal memory and work-journal system. Search memory before answering
  domain questions. Log work after resolving issues. Query work history.
  
  AUTO-TRIGGER when:
  - User asks about their projects, infra, repos, past decisions, conventions
  - User shows a ticket or issue → check if it's recurring
  - You need context you don't have (instead of asking the user, search memory)
  - A ticket/issue is resolved → log it  
  - User says "remember this", "add to memory", "log this"
  - User asks "what did I work on", "how many tickets", "is X recurring"
  
  NEVER ask the user for context that might already be in memory — search first.
---

# pi-memory — Agent Memory & Work Journal

## Rule 1: Search Before Asking

If you need context about the user's projects, infrastructure, past decisions,
or recurring issues — **search memory first**. Do not ask the user.

## Rule 2: Log After Resolving

When a ticket is resolved, a decision is made, or something important is
learned — **log it**. This builds the work history used for future recall.

## Rule 3: Recurring Issue Check

When the user shows you an issue or error — **check if it's recurring** before
diving into investigation. It may already have a known resolution.

---

## Using the Tools

### Preferred: MCP tools (if pi-memory is connected as an MCP server)

```
memory_search   — semantic search across all memory
memory_get      — read a specific file or section
memory_write    — append to today's daily log
memory_log      — structured work entry (ticket/decision/learning)
memory_query    — meta-questions about work history
memory_index    — reindex files
memory_status   — index statistics
memory_promote  — consolidate daily notes → MEMORY.md
```

### Fallback: CLI via bash tool

```bash
pi-memory search "<query>"
pi-memory get <path>
pi-memory write "<text>"
pi-memory log ticket --id TKT-123 --summary "..." --resolution "..." --tags "tag1,tag2"
pi-memory log decision --summary "..." --context "..."
pi-memory log learning --summary "..." --tags "..."
pi-memory query "how many tickets this week"
pi-memory query "is august sync a recurring issue"
pi-memory query "what did I work on yesterday"
pi-memory status
pi-memory index --force
pi-memory promote
```

All commands support `--json` for structured output.

## Workflow Examples

### Starting a new investigation
```
1. memory_search("august lock sync timeout property 8847")
2. If recurring match found → report to user with past resolution
3. If not → proceed with investigation
4. After resolution → memory_log ticket
```

### User asks about infra/architecture
```
1. memory_search("ssh tunnel mysql connection setup")
2. Load relevant file with memory_get if needed
3. Answer from memory context
```

### User says "remember this"
```
1. memory_write(user's text)
   OR
2. memory_log(type="note", summary=user's text)
```

### Weekly review
```
1. memory_query("what did I work on this week")
2. memory_query("how many tickets this week")
3. memory_query("what patterns am I seeing")
```

## Output Format

`memory_search` returns:
```json
{
  "results": [
    { "path": "knowledge/db-schema.md", "source": "knowledge", "score": 0.87, "snippet": "..." },
    { "path": "daily/2026-05-25.md",    "source": "daily",     "score": 0.72, "snippet": "..." }
  ],
  "total": 2,
  "ollamaUsed": true
}
```

Use `snippet` to inform your response. Call `memory_get` on the path if
you need the full file content.

## Full Tool Reference

See [references/tools.md](references/tools.md) for complete parameter schemas.

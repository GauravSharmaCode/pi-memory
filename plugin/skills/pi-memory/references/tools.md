# pi-memory Tool Reference

## memory_search

```
Input:
  query       string   (required) Natural language search query
  maxResults  number   Max results (default: 5)
  source      string   'all' | 'daily' | 'knowledge' | 'memory' | 'worklog'

Output:
  results[]
    path       string  Relative path in workspace
    source     string  'daily' | 'knowledge' | 'memory' | 'worklog'
    score      number  0.0–1.0 (higher = more relevant)
    snippet    string  Matching text excerpt (up to 500 chars)
    startLine  number
    endLine    number
  total        number
  ollamaUsed   boolean  false = keyword-only (Ollama offline)
```

## memory_get

```
Input:
  path   string  (required) Relative path, e.g. "knowledge/db-schema.md"
  from   number  Start line (1-indexed, optional)
  lines  number  Lines to return (optional, default: all)

Output:
  path        string
  content     string
  totalLines  number
  from        number
  returned    number
```

## memory_write

```
Input:
  text   string  (required) Content to append
  file   string  Target path (optional, defaults to daily/YYYY-MM-DD.md)

Output:
  file     string  File written to
  appended number  Characters written
  indexed  boolean Whether indexing was triggered
```

## memory_log

```
Input:
  type        string   (required) 'ticket' | 'decision' | 'learning' | 'note'
  summary     string   (required) Short description
  ticketId    string   Ticket/issue ID (e.g. TKT-4521)
  resolution  string   How it was resolved
  context     string   Additional context or background
  tags        string[] Topic tags, e.g. ["august", "sync", "sqs"]
  timeSpent   string   e.g. "25m", "2h"
  recurring   boolean  Mark as recurring issue

Output:
  id       string  UUID of log entry
  type     string
  ts       string  ISO timestamp
  summary  string
  file     string  JSONL file written to
```

## memory_query

```
Input:
  question  string  (required) Natural language question

Supported query types (auto-detected):
  ticket_count    "how many tickets this week/month"
  recurring_check "is august sync a recurring issue"
  timeline        "what did I work on yesterday/this week"
  pattern_detect  "what patterns am I seeing"
  time_spent      "how much time did I spend on X"
  freeform        Falls back to hybrid search

Output:
  question   string
  queryType  string
  answer     string  Human-readable answer
  data       any     Raw rows (optional)
```

## memory_index

```
Input:
  force  boolean  Force full reindex (default: false)

Output:
  files   number  Files reindexed
  chunks  number  Chunks created
  tookMs  number  Time taken
```

## memory_status

```
Output:
  workspace       string
  totalChunks     number
  chunksBySource  { daily: N, knowledge: N, memory: N }
  totalWorklog    number
  indexedFiles    number
  ollamaModel     string
  embeddedChunks  number
```

## memory_promote

```
Input:
  dryRun  boolean  Preview without writing (default: false)

Output:
  promoted[]
    chunkId  string
    path     string
    snippet  string
  total    number
  dryRun   boolean
```

#!/usr/bin/env node
/**
 * pi-memory MCP Server
 * Exposes memory tools via Model Context Protocol (stdio transport).
 * Compatible with: Claude Desktop, Cursor, Antigravity, Gemini CLI, any MCP client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { init, shutdown } from './core/memory-manager.js';
import { searchMemory } from './tools/search.js';
import { getMemoryFile, listMemoryFiles } from './tools/get.js';
import { writeMemory } from './tools/write.js';
import { logWork } from './tools/log.js';
import { queryMemory } from './tools/query.js';
import { indexMemory, memoryStatus, promoteMemory } from './tools/manage.js';

// ── Tool schemas ──────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'memory_search',
    description: 'Semantic search across all memory (knowledge, daily logs, work history). Use before answering domain questions to surface relevant context.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: 'Natural language search query' },
        maxResults: { type: 'number', description: 'Max results to return (default: 5)' },
        source:     { type: 'string', enum: ['all', 'daily', 'knowledge', 'memory', 'worklog'], description: 'Filter by source (default: all)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_get',
    description: 'Read a specific memory file or a line range from it.',
    inputSchema: {
      type: 'object',
      properties: {
        path:  { type: 'string', description: 'Relative path within workspace (e.g. knowledge/db-schema.md)' },
        from:  { type: 'number', description: 'Start line (1-indexed)' },
        lines: { type: 'number', description: 'Number of lines to return' },
      },
      required: ['path'],
    },
  },
  {
    name: 'memory_write',
    description: 'Append text to today\'s daily log or a specific file. Use after resolving issues, making decisions, or when the user says "remember this".',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Content to write' },
        file: { type: 'string', description: 'Target file path (optional, defaults to today\'s daily log)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_log',
    description: 'Log a structured work entry (ticket resolved, decision made, learning captured). Builds a searchable work history.',
    inputSchema: {
      type: 'object',
      properties: {
        type:       { type: 'string', description: 'Entry type — e.g. ticket, decision, learning, note, incident, pr, meeting, or any custom label' },
        summary:    { type: 'string', description: 'Short description of what happened' },
        ticketId:   { type: 'string', description: 'Ticket/issue ID (e.g. TKT-4521)' },
        resolution: { type: 'string', description: 'How it was resolved' },
        context:    { type: 'string', description: 'Additional context' },
        tags:       { type: 'array', items: { type: 'string' }, description: 'Topic tags (e.g. ["august", "sync", "sqs"])' },
        timeSpent:  { type: 'string', description: 'Time spent (e.g. "25m", "2h")' },
        recurring:  { type: 'boolean', description: 'Mark as recurring issue' },
      },
      required: ['type', 'summary'],
    },
  },
  {
    name: 'memory_query',
    description: 'Answer meta-questions about work history: ticket counts, recurring issues, timelines, patterns. Examples: "how many tickets this week?", "is august sync a recurring issue?", "what did I work on yesterday?"',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question about work history' },
      },
      required: ['question'],
    },
  },
  {
    name: 'memory_index',
    description: 'Reindex memory files. Runs automatically on startup; call manually if files were modified externally.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force full reindex even if files are unchanged' },
      },
    },
  },
  {
    name: 'memory_status',
    description: 'Show memory index statistics: chunk count, indexed files, embedding coverage, workspace path.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory_promote',
    description: 'Promote frequently-recalled daily-log snippets to MEMORY.md for permanent retention.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: 'Preview what would be promoted without writing' },
      },
    },
  },
];

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'pi-memory', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    let result: unknown;

    switch (name) {
      case 'memory_search':
        result = await searchMemory({
          query:      a.query as string,
          maxResults: a.maxResults as number | undefined,
          source:     a.source as any,
        });
        break;

      case 'memory_get':
        result = getMemoryFile({
          path:  a.path as string,
          from:  a.from as number | undefined,
          lines: a.lines as number | undefined,
        });
        break;

      case 'memory_write':
        result = await writeMemory({
          text: a.text as string,
          file: a.file as string | undefined,
        });
        break;

      case 'memory_log':
        result = await logWork({
          type:       a.type as any,
          summary:    a.summary as string,
          ticketId:   a.ticketId as string | undefined,
          resolution: a.resolution as string | undefined,
          context:    a.context as string | undefined,
          tags:       a.tags as string[] | undefined,
          timeSpent:  a.timeSpent as string | undefined,
          recurring:  a.recurring as boolean | undefined,
        });
        break;

      case 'memory_query':
        result = await queryMemory({ question: a.question as string });
        break;

      case 'memory_index':
        result = await indexMemory({ force: a.force as boolean | undefined });
        break;

      case 'memory_status':
        result = memoryStatus();
        break;

      case 'memory_promote':
        result = await promoteMemory({ dryRun: a.dryRun as boolean | undefined });
        break;

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${msg}`);
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Initialize with watcher (persistent process)
  await init({ watch: true, force: false });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[pi-memory] MCP server running (stdio)');

  const gracefulShutdown = async () => {
    console.error('[pi-memory] Shutting down...');
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT',  gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

main().catch((e) => {
  console.error('[pi-memory] Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});

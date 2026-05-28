import { getDb, dbAll } from '../core/db.js';
import { hybridSearch } from '../core/search.js';

export interface QueryToolInput {
  question: string;
}

export interface QueryToolOutput {
  question:  string;
  queryType: string;
  answer:    string;
  data?:     unknown;
}

type QueryType = 'ticket_count' | 'recurring_check' | 'timeline' | 'pattern_detect' | 'time_spent' | 'freeform';

// ── Query classifier ──────────────────────────────────────────────────────────

function classifyQuery(q: string): QueryType {
  const l = q.toLowerCase();
  if (/(how many|count|number of).*(ticket|issue|fix|bug|resolved|closed)/.test(l)) return 'ticket_count';
  if (/(recurring|seen before|happen again|happened before|same issue|this before)/.test(l))  return 'recurring_check';
  if (/(what did|what have|worked on|did today|did yesterday|this week|last week|on monday|on tuesday|on wednesday|on thursday|on friday)/.test(l)) return 'timeline';
  if (/(pattern|trend|common|frequent|most|often)/.test(l))  return 'pattern_detect';
  if (/(how long|time spent|hours|minutes)/.test(l))         return 'time_spent';
  return 'freeform';
}

// ── Time range helpers ────────────────────────────────────────────────────────

function daysBoundary(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString();
}

function parseTimeRange(q: string): { from: string; label: string } {
  const l = q.toLowerCase();
  if (/yesterday/.test(l)) {
    const d = new Date(Date.now() - 86_400_000);
    const date = d.toISOString().slice(0, 10);
    return { from: `${date}T00:00:00.000Z`, label: 'yesterday' };
  }
  if (/this week|last 7|past week/.test(l)) return { from: daysBoundary(7),  label: 'this week' };
  if (/last week/.test(l))                  return { from: daysBoundary(14), label: 'last 2 weeks' };
  if (/this month|last 30/.test(l))         return { from: daysBoundary(30), label: 'this month' };
  if (/today/.test(l)) {
    const date = new Date().toISOString().slice(0, 10);
    return { from: `${date}T00:00:00.000Z`, label: 'today' };
  }
  return { from: daysBoundary(7), label: 'this week' }; // default
}

// ── Query handlers ────────────────────────────────────────────────────────────

function handleTicketCount(question: string): QueryToolOutput {
  const { from, label } = parseTimeRange(question);
  const db = getDb();

  const rows = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM   worklog
    WHERE  ts >= ?
    GROUP  BY type
    ORDER  BY count DESC
  `).all(from) as { type: string; count: number }[];

  const total   = rows.reduce((s, r) => s + r.count, 0);
  const tickets = rows.find((r) => r.type === 'ticket')?.count ?? 0;

  const breakdown = rows.map((r) => `  • ${r.type}: ${r.count}`).join('\n');
  const answer = total === 0
    ? `No work logged for ${label}.`
    : `**${total} entries** logged for ${label}:\n${breakdown}\n\nTickets resolved: **${tickets}**`;

  return { question, queryType: 'ticket_count', answer, data: rows };
}

function handleTimeline(question: string): QueryToolOutput {
  const { from, label } = parseTimeRange(question);

  const rows = dbAll<{
    ts: string; type: string; ticket_id: string | null;
    summary: string; resolution: string | null; time_spent: string | null;
  }>(`
    SELECT ts, type, ticket_id, summary, resolution, time_spent
    FROM   worklog
    WHERE  ts >= ?
    ORDER  BY ts DESC
    LIMIT  50
  `, [from]);

  if (rows.length === 0) {
    return { question, queryType: 'timeline', answer: `No work logged for ${label}.` };
  }

  const lines = rows.map((r) => {
    const when = r.ts.slice(0, 16).replace('T', ' ');
    const tag  = r.ticket_id ? ` [${r.ticket_id}]` : '';
    return `**${when}** [${r.type}]${tag} ${r.summary}${r.resolution ? ` → ${r.resolution}` : ''}`;
  });

  return {
    question,
    queryType: 'timeline',
    answer: `**Work log for ${label}** (${rows.length} entries):\n\n${lines.join('\n')}`,
    data: rows,
  };
}

async function handleRecurringCheck(question: string): Promise<QueryToolOutput> {
  // Extract the core topic from the question
  const topic = question
    .replace(/(is|this|a|an|the|recurring|seen before|happened before|happen again)/gi, '')
    .trim();

  // Search worklog for similar past entries
  const results = await hybridSearch(topic, { maxResults: 10, source: 'worklog' });
  const worklogRows = dbAll<{
    ts: string; ticket_id: string | null; summary: string; resolution: string | null;
  }>(`
    SELECT ts, ticket_id, summary, resolution
    FROM   worklog
    WHERE  type = 'ticket'
    ORDER  BY ts DESC
    LIMIT  100
  `);

  // Also do a keyword check in worklog table directly
  const keywords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const matching = worklogRows.filter((r) => {
    const text = `${r.summary} ${r.resolution ?? ''}`.toLowerCase();
    return keywords.some((k) => text.includes(k));
  });

  if (matching.length <= 1) {
    return {
      question,
      queryType: 'recurring_check',
      answer: `No recurring pattern found for "${topic}". ${matching.length === 1 ? 'Found 1 similar past entry.' : 'No similar past entries found.'}`,
      data: matching,
    };
  }

  const lines = matching.map((r) => {
    const when = r.ts.slice(0, 10);
    const tag  = r.ticket_id ? ` [${r.ticket_id}]` : '';
    return `  • ${when}${tag} ${r.summary}`;
  });

  return {
    question,
    queryType: 'recurring_check',
    answer: `⚠️ **Recurring issue detected** (${matching.length} occurrences for "${topic}"):\n\n${lines.join('\n')}\n\nConsider a permanent fix.`,
    data: matching,
  };
}

function handlePatternDetect(): QueryToolOutput {
  const rows = dbAll<{ tags: string; count: number }>(`
    SELECT tags, COUNT(*) as count
    FROM   worklog
    WHERE  tags IS NOT NULL AND tags != '' AND ts >= ?
    GROUP  BY tags
    ORDER  BY count DESC
    LIMIT  15
  `, [new Date(Date.now() - 30 * 86_400_000).toISOString()]);

  if (rows.length === 0) {
    return { question: 'patterns', queryType: 'pattern_detect', answer: 'No tagged work entries in the last 30 days.' };
  }

  const lines = rows.map((r) => `  • [${r.tags}]: ${r.count} entries`).join('\n');
  return {
    question: 'patterns',
    queryType: 'pattern_detect',
    answer: `**Frequent work patterns (last 30 days)**:\n\n${lines}`,
    data: rows,
  };
}

function handleTimeSpent(question: string): QueryToolOutput {
  const { from, label } = parseTimeRange(question);
  const rows = dbAll<{ summary: string; time_spent: string; ts: string }>(`
    SELECT summary, time_spent, ts
    FROM   worklog
    WHERE  time_spent IS NOT NULL AND ts >= ?
    ORDER  BY ts DESC
  `, [from]);

  if (rows.length === 0) {
    return { question, queryType: 'time_spent', answer: `No time-tracked entries for ${label}.` };
  }

  const lines = rows.map((r) => `  • ${r.ts.slice(0, 10)} ${r.summary}: ${r.time_spent}`).join('\n');
  return { question, queryType: 'time_spent', answer: `**Time log for ${label}**:\n\n${lines}`, data: rows };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function queryMemory(input: QueryToolInput): Promise<QueryToolOutput> {
  const type = classifyQuery(input.question);

  switch (type) {
    case 'ticket_count':   return handleTicketCount(input.question);
    case 'timeline':       return handleTimeline(input.question);
    case 'recurring_check':return handleRecurringCheck(input.question);
    case 'pattern_detect': return handlePatternDetect();
    case 'time_spent':     return handleTimeSpent(input.question);
    case 'freeform':
    default: {
      // Fall back to hybrid search over all memory
      const results = await hybridSearch(input.question, { maxResults: 5 });
      if (results.length === 0) {
        return { question: input.question, queryType: 'freeform', answer: 'No relevant memory found.' };
      }
      const answer = results
        .map((r) => `**[${r.path}]** (score: ${r.score.toFixed(2)})\n${r.snippet}`)
        .join('\n\n---\n\n');
      return { question: input.question, queryType: 'freeform', answer, data: results };
    }
  }
}

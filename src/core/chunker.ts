export interface Chunk {
  text: string;
  startLine: number;
  endLine: number;
  headingContext: string; // e.g. "## Section > ### Subsection"
}

const MAX_CHUNK_CHARS = 1800;
const OVERLAP_CHARS   = 150;
const HEADING_RE      = /^(#{1,6})\s+(.+)$/;

/**
 * Split a markdown file into semantic chunks.
 * Chunks are bounded by headings. Oversized sections are split by paragraph
 * with overlap so context isn't lost across boundaries.
 */
export function chunkMarkdown(content: string): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  // Track heading hierarchy
  const headingStack: string[] = [];

  // Accumulate current section
  let sectionStart = 0;
  let sectionLines: string[] = [];

  function flushSection(endLine: number): void {
    if (sectionLines.length === 0) return;
    const text = sectionLines.join('\n').trim();
    if (text.length === 0) return;

    const context = headingStack.join(' > ');

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        text: context ? `[${context}]\n\n${text}` : text,
        startLine: sectionStart,
        endLine: endLine,
        headingContext: context,
      });
    } else {
      // Split oversized sections into overlapping paragraphs
      splitByParagraph(text, sectionStart, endLine, context, chunks);
    }

    sectionLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(HEADING_RE);

    if (headingMatch) {
      flushSection(i - 1);
      sectionStart = i;

      const level = headingMatch[1].length;
      const title  = headingMatch[2].trim();

      // Trim heading stack to current level
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push(title);
    }

    sectionLines.push(line);
  }

  flushSection(lines.length - 1);

  return chunks.filter((c) => c.text.trim().length > 20);
}

function splitByParagraph(
  text: string,
  startLine: number,
  endLine: number,
  context: string,
  out: Chunk[],
): void {
  const paragraphs = text.split(/\n{2,}/);
  let buffer      = context ? `[${context}]\n\n` : '';
  let bufferStart = startLine;

  for (const para of paragraphs) {
    const withPara = buffer + para + '\n\n';

    if (withPara.length > MAX_CHUNK_CHARS && buffer.length > 0) {
      out.push({ text: buffer.trim(), startLine: bufferStart, endLine, headingContext: context });
      // Overlap: carry last OVERLAP_CHARS into next chunk
      buffer = (context ? `[${context}]\n\n` : '') + buffer.slice(-OVERLAP_CHARS) + para + '\n\n';
      bufferStart = startLine;
    } else {
      buffer = withPara;
    }
  }

  if (buffer.trim().length > 20) {
    out.push({ text: buffer.trim(), startLine: bufferStart, endLine, headingContext: context });
  }
}

import { test } from 'node:test';
import * as assert from 'node:assert';
import { chunkMarkdown } from '../../src/core/chunker.js';

test('chunkMarkdown with empty string', () => {
  const chunks = chunkMarkdown('');
  assert.deepStrictEqual(chunks, []);
});

test('chunkMarkdown with text that is too short', () => {
  const chunks = chunkMarkdown('Too short');
  assert.deepStrictEqual(chunks, []);
});

test('chunkMarkdown with short text without headings', () => {
  const text = 'This is a short text that is just long enough to not be filtered out. Need a bit more text here.';
  const chunks = chunkMarkdown(text);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].text, text);
  assert.strictEqual(chunks[0].startLine, 0);
  assert.strictEqual(chunks[0].endLine, 0);
  assert.strictEqual(chunks[0].headingContext, '');
});

test('chunkMarkdown with simple headings', () => {
  const text = `# Heading 1\nSome text under heading 1 that is long enough.\n## Heading 2\nSome text under heading 2 that is long enough.`;
  const chunks = chunkMarkdown(text);
  assert.strictEqual(chunks.length, 2);

  assert.strictEqual(chunks[0].headingContext, 'Heading 1');
  assert.strictEqual(chunks[0].text, '[Heading 1]\n\n# Heading 1\nSome text under heading 1 that is long enough.');
  assert.strictEqual(chunks[0].startLine, 0);
  assert.strictEqual(chunks[0].endLine, 1);

  assert.strictEqual(chunks[1].headingContext, 'Heading 1 > Heading 2');
  assert.strictEqual(chunks[1].text, '[Heading 1 > Heading 2]\n\n## Heading 2\nSome text under heading 2 that is long enough.');
  assert.strictEqual(chunks[1].startLine, 2);
  assert.strictEqual(chunks[1].endLine, 3);
});

test('chunkMarkdown with deeply nested headings', () => {
  const text = `# H1\n## H2\n### H3\n#### H4\nText under H4 that is sufficiently long.`;
  const chunks = chunkMarkdown(text);
  assert.strictEqual(chunks.length, 2); // ### H3 and #### H4 both end up producing >20 char texts

  assert.strictEqual(chunks[0].headingContext, 'H1 > H2 > H3');
  assert.strictEqual(chunks[0].text, '[H1 > H2 > H3]\n\n### H3');

  assert.strictEqual(chunks[1].headingContext, 'H1 > H2 > H3 > H4');
  assert.strictEqual(chunks[1].text, '[H1 > H2 > H3 > H4]\n\n#### H4\nText under H4 that is sufficiently long.');
});

test('chunkMarkdown with oversized section', () => {
  // Create an oversized section
  const longParagraph1 = 'A'.repeat(1000) + ' and some words that make it long enough.';
  const longParagraph2 = 'B'.repeat(1000) + ' and some words that make it long enough.';
  const text = `# Big Section\n${longParagraph1}\n\n${longParagraph2}`;

  const chunks = chunkMarkdown(text);

  // It should be split into multiple chunks
  assert.strictEqual(chunks.length > 1, true);

  // Both chunks should have the heading context
  assert.strictEqual(chunks[0].headingContext, 'Big Section');
  assert.strictEqual(chunks[1].headingContext, 'Big Section');

  // The first chunk should start with the context
  assert.strictEqual(chunks[0].text.startsWith('[Big Section]\n\n'), true);

  // The first chunk should contain the first paragraph
  assert.strictEqual(chunks[0].text.includes(longParagraph1), true);

  // The second chunk should contain the second paragraph
  assert.strictEqual(chunks[1].text.includes(longParagraph2), true);
});

test('chunkMarkdown ignores small chunks except if context makes it >20 chars', () => {
    const text = `# H1\nSmall text.\n## H2\nAnother small text.\n### H3\nThis text is long enough to be kept. It needs to be more than 20 characters.`;
    const chunks = chunkMarkdown(text);

    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].headingContext, 'H1');
    assert.strictEqual(chunks[1].headingContext, 'H1 > H2');
    assert.strictEqual(chunks[2].headingContext, 'H1 > H2 > H3');
});

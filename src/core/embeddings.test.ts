import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { cosineSimilarity } from './embeddings.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    // Due to floating point inaccuracy, use a tolerance
    const sim1 = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    assert.ok(Math.abs(sim1 - 1) < 1e-9);

    const sim2 = cosineSimilarity([0.5, 0.5], [0.5, 0.5]);
    assert.ok(Math.abs(sim2 - 1) < 1e-9);
  });

  it('returns -1 for completely opposite vectors', () => {
    const sim1 = cosineSimilarity([1, 2, 3], [-1, -2, -3]);
    assert.ok(Math.abs(sim1 - -1) < 1e-9);

    const sim2 = cosineSimilarity([0.5, 0.5], [-0.5, -0.5]);
    assert.ok(Math.abs(sim2 - -1) < 1e-9);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.strictEqual(cosineSimilarity([2, 0, 0], [0, 0, 3]), 0);
  });

  it('calculates correct similarity for arbitrary vectors', () => {
    // A = [1, 2, 3], B = [4, 5, 6]
    // dot = 4 + 10 + 18 = 32
    // magA = sqrt(1 + 4 + 9) = sqrt(14)
    // magB = sqrt(16 + 25 + 36) = sqrt(77)
    // sim = 32 / (sqrt(14) * sqrt(77)) = 32 / sqrt(1078) ≈ 0.974631846
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    assert.ok(Math.abs(sim - 0.9746318) < 1e-6);
  });

  it('returns 0 if either vector has magnitude 0', () => {
    assert.strictEqual(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
    assert.strictEqual(cosineSimilarity([1, 2, 3], [0, 0, 0]), 0);
    assert.strictEqual(cosineSimilarity([0, 0], [0, 0]), 0);
  });

  it('returns 0 for empty vectors', () => {
    assert.strictEqual(cosineSimilarity([], []), 0);
  });

  it('returns 0 for vectors of mismatched lengths', () => {
    assert.strictEqual(cosineSimilarity([1, 2], [1, 2, 3]), 0);
    assert.strictEqual(cosineSimilarity([1, 2, 3], [1, 2]), 0);
  });
});

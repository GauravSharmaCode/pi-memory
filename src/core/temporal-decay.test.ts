import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDecayFactor, applyTemporalDecay } from './temporal-decay.js';
import { config } from '../config.js';

describe('temporal-decay', () => {
  const MS_PER_DAY = 86_400_000;

  describe('computeDecayFactor', () => {
    it('should return ~1.0 for very recent content (age 0)', () => {
      const nowMs = Date.now();
      const factor = computeDecayFactor(nowMs, nowMs);
      assert.equal(factor, 1.0);
    });

    it('should return 0.5 for content at half-life age', () => {
      const nowMs = Date.now();
      const halfLifeMs = config.search.temporalDecayHalfLifeDays * MS_PER_DAY;
      const fileMtimeMs = nowMs - halfLifeMs;
      const factor = computeDecayFactor(fileMtimeMs, nowMs);
      assert.equal(factor, 0.5);
    });

    it('should floor at 0.1 for very old content', () => {
      const nowMs = Date.now();
      // Age is 10 times the half-life
      const veryOldMs = 10 * config.search.temporalDecayHalfLifeDays * MS_PER_DAY;
      const fileMtimeMs = nowMs - veryOldMs;
      const factor = computeDecayFactor(fileMtimeMs, nowMs);
      assert.equal(factor, 0.1);
    });

    it('should return 1.0 for future modifications (age < 0)', () => {
      const nowMs = Date.now();
      const futureMs = nowMs + MS_PER_DAY;
      const factor = computeDecayFactor(futureMs, nowMs);
      assert.equal(factor, 1.0);
    });
  });

  describe('applyTemporalDecay', () => {
    it('should apply decay based on fileMtime correctly', () => {
      const nowMs = Date.now();
      const halfLifeMs = config.search.temporalDecayHalfLifeDays * MS_PER_DAY;

      const results = [
        { id: '1', score: 1.0, fileMtime: nowMs }, // factor 1.0
        { id: '2', score: 1.0, fileMtime: nowMs - halfLifeMs }, // factor 0.5
        { id: '3', score: 1.0, fileMtime: nowMs - (10 * halfLifeMs) }, // factor 0.1
      ];

      const decayed = applyTemporalDecay(results, nowMs);

      assert.equal(decayed[0].score, 1.0);
      assert.equal(decayed[1].score, 0.5);
      assert.equal(decayed[2].score, 0.1);
    });

    it('should not apply decay if fileMtime is missing', () => {
      const nowMs = Date.now();

      const results = [
        { id: '1', score: 0.8 },
        { id: '2', score: 0.6 },
      ];

      const decayed = applyTemporalDecay(results, nowMs);

      assert.equal(decayed[0].score, 0.8);
      assert.equal(decayed[1].score, 0.6);
    });

    it('should preserve other properties', () => {
      const nowMs = Date.now();
      const halfLifeMs = config.search.temporalDecayHalfLifeDays * MS_PER_DAY;

      const results = [
        { id: 'doc-1', title: 'Test Document', score: 100, fileMtime: nowMs - halfLifeMs },
      ];

      const decayed = applyTemporalDecay(results, nowMs);

      assert.equal(decayed.length, 1);
      assert.equal(decayed[0].id, 'doc-1');
      assert.equal(decayed[0].title, 'Test Document');
      assert.equal(decayed[0].score, 50);
      assert.equal(decayed[0].fileMtime, nowMs - halfLifeMs);
    });
  });
});

import { config } from '../config.js';

export interface TemporalDecayResult {
  score: number;
  decayFactor: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Compute a decay multiplier for a chunk based on how recently it was last modified.
 * Uses exponential decay: factor = 0.5 ^ (age_days / half_life_days)
 * So a chunk at half-life age gets multiplied by 0.5.
 * Very recent content (< 1 day) gets factor ~1.0.
 * Very old content (>> half-life) decays toward 0.
 *
 * NOTE: We floor at 0.1 so old content is still findable.
 */
export function computeDecayFactor(fileMtimeMs: number, nowMs: number = Date.now()): number {
  const ageMs   = Math.max(0, nowMs - fileMtimeMs);
  const ageDays = ageMs / MS_PER_DAY;
  const halfLife = config.search.temporalDecayHalfLifeDays;
  const factor  = Math.pow(0.5, ageDays / halfLife);
  return Math.max(0.1, factor);
}

/** Apply temporal decay to a set of hybrid search results. */
export function applyTemporalDecay<T extends { score: number; fileMtime?: number }>(
  results: T[],
  nowMs: number = Date.now(),
): T[] {
  return results.map((r) => ({
    ...r,
    score: r.fileMtime
      ? r.score * computeDecayFactor(r.fileMtime, nowMs)
      : r.score,
  }));
}

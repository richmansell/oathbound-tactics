/**
 * Deterministic RNG. State is a single uint32 stored in BattleState.rng so the
 * whole battle replays identically from (seed, commands).
 */

/** mulberry32 step: returns [value in [0,1), nextState]. */
export function rngStep(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Mutable RNG view over an object holding `rng`. */
export interface RngHolder { rng: number }

export function rand(h: RngHolder): number {
  const [v, n] = rngStep(h.rng);
  h.rng = n;
  return v;
}

/** Integer in [min, max] inclusive. */
export function randInt(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(rand(h) * (max - min + 1));
}

/** True with probability pct/100. */
export function chance(h: RngHolder, pct: number): boolean {
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return rand(h) * 100 < pct;
}

export function pick<T>(h: RngHolder, arr: readonly T[]): T {
  return arr[Math.floor(rand(h) * arr.length)];
}

/** Hash a string to a uint32 seed (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stateless hash of integers → [0,1). Used by world generation. */
export function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

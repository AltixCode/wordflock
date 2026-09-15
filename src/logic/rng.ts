/**
 * Seeded pseudo-random numbers.
 *
 * Every puzzle in the app is a pure function of a date, which means generation
 * must be reproducible: the same day produces the same three puzzles on every
 * device, forever, with no server involved. `Math.random` cannot do that.
 *
 * mulberry32 — 32-bit state, one multiply-xorshift round. Fast, and unlike a
 * naive LCG it does not degenerate when seeded with 0, which matters because
 * day zero is a legitimate seed.
 */

export interface Rng {
  /** The next value in [0, 1). */
  next(): number;
  /** A uniform integer in [0, max). `max` must be at least 1. */
  int(max: number): number;
}

export function makeRng(seed: number): Rng {
  // The increment is what keeps a zero seed moving.
  let state = (seed >>> 0) + 0x6d2b79f5;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (max) => Math.floor(next() * max),
  };
}

/**
 * A Fisher-Yates shuffle of a copy of `items`.
 *
 * Returns a new array rather than shuffling in place: the generators reuse
 * their candidate lists across backtracking attempts, and a mutating shuffle
 * would silently corrupt the search.
 */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Turns a date key such as `2026-09-15` into a stable 32-bit seed.
 *
 * FNV-1a: no collisions across any realistic run of dates, and identical in
 * every JS engine — which a `hashCode`-style accumulation with overflow is not.
 */
export function seedFromKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

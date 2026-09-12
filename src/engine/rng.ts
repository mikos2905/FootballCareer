/**
 * The single source of randomness for a career run.
 *
 * One instance, one stream, consumed in a strictly deterministic order. Every
 * uncertain outcome in the simulation pulls from here, so a seed plus a
 * decision sequence reproduces a career exactly, byte for byte.
 *
 * Math.random() is banned in this directory by ESLint and by a test.
 */

const UINT32 = 4294967296;

/** mulberry32. Small, fast, and good enough for a game: 32-bit state, period 2^32. */
function mulberry32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

export class Rng {
  readonly seed: number;
  /** How many raw draws have been consumed. Useful for asserting stream alignment in tests. */
  private consumed = 0;
  private readonly step: () => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.step = mulberry32(this.seed);
  }

  get draws(): number {
    return this.consumed;
  }

  /** Raw draw in [0, 1). Every other method is built on this one. */
  next(): number {
    this.consumed += 1;
    return this.step();
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max], inclusive at both ends. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: empty range [${min}, ${max}]`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. Reserve this for genuinely binary events. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * Weighted choice. Weights must be non-negative and not all zero. Consumes
   * exactly one draw regardless of list length, which keeps stream positions
   * stable when the candidate list changes size.
   */
  weighted<T>(items: readonly T[], weightOf: (item: T, index: number) => number): T {
    if (items.length === 0) throw new Error('Rng.weighted: empty array');
    const weights = items.map((item, i) => {
      const w = weightOf(item, i);
      if (!Number.isFinite(w) || w < 0) throw new Error(`Rng.weighted: bad weight ${w} at index ${i}`);
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return items[this.int(0, items.length - 1)] as T;
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i] as number;
      if (roll < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Fisher-Yates, in place on a copy. Consumes n-1 draws. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }

  /**
   * Standard normal, Box-Muller. Always consumes exactly two draws — no
   * rejection loop — so the stream advances by a fixed amount every call.
   */
  normal(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * The workhorse of the simulation: a draw around an expectation with bounded
   * variance. Not a coin flip, not a flat table — an expected value computed
   * from game state, plus noise, clamped to what is actually possible.
   *
   * `spread` is one standard deviation. `clampSigma` caps the tail so a single
   * absurd roll cannot end a career, while still allowing genuinely bad years.
   */
  around(mean: number, spread: number, min = -Infinity, max = Infinity, clampSigma = 2.5): number {
    const z = clamp(this.normal(), -clampSigma, clampSigma);
    return clamp(mean + z * spread, min, max);
  }

  /**
   * Skewed variant for counting outcomes that have a long upper tail but a hard
   * floor at zero — goals, assists, caps. A poor season is common, a monstrous
   * one is rare but reachable.
   */
  aroundSkewed(mean: number, spread: number, max = Infinity, clampSigma = 2.75): number {
    const z = clamp(this.normal(), -clampSigma, clampSigma);
    const skewed = z >= 0 ? z * 1.25 : z * 0.85;
    return clamp(mean + skewed * spread, 0, max);
  }

  /** Rounds a fractional expectation to an integer without biasing the mean. */
  roundStochastic(value: number): number {
    const floor = Math.floor(value);
    return floor + (this.next() < value - floor ? 1 : 0);
  }
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Turns whatever a player typed in the seed box into a uint32.
 *
 * Plain digits inside the uint32 range are used as-is, so a shared seed reads
 * back the way it was shared. Anything else is hashed (cyrb53, truncated), so
 * "goldenboy" is a perfectly good seed.
 */
export function parseSeed(input: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n) && n < UINT32) return n >>> 0;
  }
  return hashString(trimmed);
}

export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** A fresh seed for "leave it blank". Lives outside the engine's purity contract. */
export function randomSeed(entropy: number): number {
  return hashString(`${entropy}`);
}

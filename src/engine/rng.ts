/**
 * Randomness for a career run.
 *
 * Every draw in the simulation comes from a named substream derived from the
 * master seed, the subsystem name and the season index — see substream() at the
 * bottom of this file. A seed plus a decision sequence still reproduces a
 * career exactly, but adding a draw inside the injury model no longer shifts
 * what happens in the transfer market.
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

// ---------------------------------------------------------------------------
// Substreams
// ---------------------------------------------------------------------------

/**
 * Subsystems that own their own stream. Each gets an independent PRNG per
 * season, so a change to one subsystem's draw count cannot perturb another's
 * results for an existing seed. That is what makes tuning possible: a shifted
 * distribution is a balance change, never a stream artefact.
 */
export type SubstreamName =
  | 'creation'
  | 'injuries'
  | 'transfers'
  | 'matches'
  | 'development'
  | 'national'
  | 'leagueTables';

/** xmur3. Mixes an arbitrary string into a well-distributed uint32. */
function xmur3(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A fresh, independent PRNG for one subsystem in one season. */
export function substream(masterSeed: number, name: SubstreamName, season: number): Rng {
  return new Rng(xmur3(`${masterSeed >>> 0}|${name}|${season}`));
}

// ---------------------------------------------------------------------------
// Count distributions
// ---------------------------------------------------------------------------

/**
 * Gamma draw, Marsaglia-Tsang. Uses a rejection loop, so the number of raw
 * draws it consumes varies — which is exactly why counts live behind
 * substreams rather than on a shared stream.
 */
function gamma(rng: Rng, shape: number, scale: number): number {
  if (shape < 1) {
    // Boost a sub-unit shape up into the range the main algorithm handles.
    const u = Math.max(rng.next(), Number.MIN_VALUE);
    return gamma(rng, shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let guard = 0; guard < 1000; guard += 1) {
    const z = rng.normal();
    const v = Math.pow(1 + c * z, 3);
    if (v <= 0) continue;
    const u = rng.next();
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v * scale;
  }
  return d * scale;
}

/** Poisson draw. Knuth below 30, normal approximation above it. */
function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng.next();
    } while (p > limit && k < 400);
    return k - 1;
  }
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * rng.normal()));
}

/**
 * Negative binomial, as a gamma-Poisson mixture. `dispersion` is the gamma
 * shape: lower means more spread. Variance is mean + mean^2 / dispersion.
 */
export function negativeBinomial(rng: Rng, mean: number, dispersion: number): number {
  if (mean <= 0) return 0;
  const shape = Math.max(dispersion, 0.05);
  const lambda = gamma(rng, shape, mean / shape);
  return poisson(rng, lambda);
}

/**
 * An overdispersed count, parameterised the way it is actually reasoned about:
 * `varianceRatio` is variance as a multiple of the mean. Poisson is 1.
 *
 * Football has hot and cold seasons well outside Poisson variance — under a
 * plain Poisson draw every season on the table looks the same — but a fixed
 * dispersion parameter overdoes it badly at high means, which is how you end up
 * with sixty-goal seasons. Holding the ratio constant keeps the spread
 * believable at three goals and at thirty.
 */
export function overdispersed(rng: Rng, mean: number, varianceRatio: number): number {
  if (mean <= 0) return 0;
  const ratio = Math.max(varianceRatio, 1.02);
  return negativeBinomial(rng, mean, mean / (ratio - 1));
}

/** Exposed for tests and for the harness's distribution reports. */
export const distributions = { gamma, poisson };

import { describe, expect, it } from 'vitest';
import { overdispersed, Rng, substream } from '../src/engine/rng';

/**
 * Substreams are the reason tuning is possible at all: a change to the number
 * of draws one subsystem takes must not move any other subsystem's results for
 * an existing seed.
 */
describe('substreams', () => {
  it('gives every subsystem and season an independent stream', () => {
    const seen = new Set<string>();
    for (const name of ['injuries', 'transfers', 'matches', 'development', 'national', 'leagueTables'] as const) {
      for (let season = 0; season < 25; season += 1) {
        const rng = substream(4242, name, season);
        seen.add(Array.from({ length: 4 }, () => rng.next().toFixed(9)).join(','));
      }
    }
    expect(seen.size).toBe(6 * 25);
  });

  it('is reproducible for the same seed, name and season', () => {
    const draw = () => Array.from({ length: 50 }, () => substream(7, 'matches', 3).next());
    expect(draw()).toEqual(draw());
  });

  it('is unaffected by extra draws taken in another subsystem', () => {
    // Simulate an injury model that grew three extra draws.
    const before = substream(99, 'transfers', 5);
    const injuries = substream(99, 'injuries', 5);
    for (let i = 0; i < 3; i += 1) injuries.next();
    const after = substream(99, 'transfers', 5);
    expect(Array.from({ length: 20 }, () => after.next())).toEqual(
      Array.from({ length: 20 }, () => before.next()),
    );
  });

  it('produces uniform first draws, so gates on the first roll are unbiased', () => {
    // A biased first draw would silently skew every "does this happen" check
    // that opens a subsystem's season.
    const firsts: number[] = [];
    for (let seed = 1; seed <= 3000; seed += 1) {
      for (let season = 0; season < 4; season += 1) firsts.push(substream(seed, 'matches', season).next());
    }
    const mean = firsts.reduce((a, b) => a + b, 0) / firsts.length;
    expect(mean).toBeGreaterThan(0.485);
    expect(mean).toBeLessThan(0.515);
    const belowTenth = firsts.filter((v) => v < 0.1).length / firsts.length;
    expect(belowTenth).toBeGreaterThan(0.085);
    expect(belowTenth).toBeLessThan(0.115);
  });
});

describe('overdispersed counts', () => {
  it('holds variance at roughly the requested multiple of the mean', () => {
    for (const mean of [3, 12, 28]) {
      const rng = new Rng(mean * 31 + 1);
      const samples = Array.from({ length: 40_000 }, () => overdispersed(rng, mean, 2));
      const m = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((a, b) => a + (b - m) ** 2, 0) / samples.length;
      expect(m, `mean at ${mean}`).toBeGreaterThan(mean * 0.94);
      expect(m, `mean at ${mean}`).toBeLessThan(mean * 1.06);
      // The whole point: wider than Poisson, but not wildly so at high means.
      expect(variance / m, `dispersion at ${mean}`).toBeGreaterThan(1.7);
      expect(variance / m, `dispersion at ${mean}`).toBeLessThan(2.4);
    }
  });

  it('is genuinely wider than Poisson', () => {
    const rng = new Rng(5);
    const over = Array.from({ length: 20_000 }, () => overdispersed(rng, 20, 2));
    const mean = over.reduce((a, b) => a + b, 0) / over.length;
    const variance = over.reduce((a, b) => a + (b - mean) ** 2, 0) / over.length;
    // Poisson variance would be ~20; a season table drawn from that looks the
    // same every year.
    expect(variance).toBeGreaterThan(30);
  });

  it('never returns a negative or non-integer count', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 5000; i += 1) {
      const v = overdispersed(rng, 0.4, 2);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(overdispersed(rng, 0, 2)).toBe(0);
    expect(overdispersed(rng, -5, 2)).toBe(0);
  });
});

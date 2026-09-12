import { describe, expect, it } from 'vitest';
import { hashString, parseSeed, Rng } from '../src/engine/rng';

describe('Rng', () => {
  it('produces an identical stream for the same seed', () => {
    const draw = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 200 }, () => rng.next());
    };
    expect(draw(5)).toEqual(draw(5));
    expect(draw(5)).not.toEqual(draw(6));
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 20_000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('counts every draw it consumes', () => {
    const rng = new Rng(11);
    rng.next();
    expect(rng.draws).toBe(1);
    rng.normal();
    expect(rng.draws).toBe(3); // Box-Muller always takes exactly two
    rng.around(10, 2);
    expect(rng.draws).toBe(5);
  });

  it('draws around an expectation rather than flipping a coin', () => {
    const rng = new Rng(42);
    const samples = Array.from({ length: 20_000 }, () => rng.around(20, 5, 0, 100));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    expect(mean).toBeGreaterThan(19.6);
    expect(mean).toBeLessThan(20.4);
    expect(sd).toBeGreaterThan(3.8);
    expect(sd).toBeLessThan(5.2);
  });

  it('bounds the tails so one roll cannot end a career', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50_000; i += 1) {
      const v = rng.around(50, 10, -Infinity, Infinity, 2.5);
      expect(v).toBeGreaterThanOrEqual(25);
      expect(v).toBeLessThanOrEqual(75);
    }
  });

  it('respects the floor and cap in aroundSkewed', () => {
    const rng = new Rng(13);
    for (let i = 0; i < 20_000; i += 1) {
      const v = rng.aroundSkewed(4, 3, 12);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(12);
    }
  });

  it('weights choices without consuming a draw per candidate', () => {
    const rng = new Rng(99);
    const before = rng.draws;
    rng.weighted(['a', 'b', 'c', 'd', 'e'], () => 1);
    expect(rng.draws - before).toBe(1);

    const counts = { a: 0, b: 0 };
    const tally = new Rng(5);
    for (let i = 0; i < 10_000; i += 1) {
      counts[tally.weighted(['a', 'b'] as const, (x) => (x === 'a' ? 3 : 1))] += 1;
    }
    expect(counts.a / 10_000).toBeGreaterThan(0.71);
    expect(counts.a / 10_000).toBeLessThan(0.79);
  });

  it('rounds stochastically without biasing the mean', () => {
    const rng = new Rng(21);
    let total = 0;
    for (let i = 0; i < 40_000; i += 1) total += rng.roundStochastic(3.25);
    expect(total / 40_000).toBeGreaterThan(3.2);
    expect(total / 40_000).toBeLessThan(3.3);
  });
});

describe('seed parsing', () => {
  it('keeps plain numeric seeds readable so they can be shared', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('  777  ')).toBe(777);
  });

  it('hashes anything else into a uint32', () => {
    const seed = parseSeed('goldenboy');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(parseSeed('goldenboy')).toBe(seed);
    expect(parseSeed('goldenboyy')).not.toBe(seed);
  });

  it('hashes numbers too large for a uint32', () => {
    expect(parseSeed('99999999999')).toBe(hashString('99999999999'));
  });
});

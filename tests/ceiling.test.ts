import { describe, expect, it } from 'vitest';
import { runCareer } from '../src/engine/career';
import { ATTRIBUTE_KEYS } from '../src/engine/types';
import { configForSeed, decisionsForSeed, scriptedPolicy, world } from './helpers';

/**
 * The hidden ceiling is a hard cap, not a target. Nothing — development,
 * decisions, delayed effects — may push an attribute past it.
 */
describe('hidden ceiling', () => {
  it('is never exceeded, in any season, across 300 careers', () => {
    const breaches: string[] = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const career = runCareer(configForSeed(seed), world, scriptedPolicy(seed, decisionsForSeed(seed)));
      for (const key of ATTRIBUTE_KEYS) {
        const value = career.player.attributes[key];
        const cap = career.player.ceiling[key];
        if (value > cap) breaches.push(`seed ${seed}: ${key} ${value} > ceiling ${cap}`);
      }
    }
    expect(breaches).toEqual([]);
  });

  it('stays within 1 to 99 for every attribute', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const career = runCareer(configForSeed(seed), world, scriptedPolicy(seed, decisionsForSeed(seed)));
      for (const key of ATTRIBUTE_KEYS) {
        expect(career.player.ceiling[key]).toBeGreaterThanOrEqual(1);
        expect(career.player.ceiling[key]).toBeLessThanOrEqual(99);
        expect(career.player.attributes[key]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is not revealed anywhere in the per-season record', () => {
    const career = runCareer(configForSeed(5), world, scriptedPolicy(5, decisionsForSeed(5)));
    const seasonKeys = new Set(career.seasons.flatMap((s) => Object.keys(s)));
    for (const forbidden of ['ceiling', 'potential', 'ceilingOvr']) {
      expect(seasonKeys.has(forbidden)).toBe(false);
    }
  });
});

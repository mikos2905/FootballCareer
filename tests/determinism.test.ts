import { describe, expect, it } from 'vitest';
import { runCareer, scriptedChooser } from '../src/engine/career';
import { configForSeed, decisionsForSeed, world } from './helpers';

/**
 * The hard requirement: same seed plus same decision sequence produces a
 * byte-identical career. Everything else in the game is negotiable.
 */
describe('determinism', () => {
  it('reproduces an identical career from the same seed and decisions', () => {
    const config = configForSeed(20250912);
    const decisions = decisionsForSeed(20250912);

    const first = runCareer(config, world, scriptedChooser(decisions));
    const second = runCareer(config, world, scriptedChooser(decisions));

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('reproduces identical careers across 100 seeds', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const config = configForSeed(seed);
      const decisions = decisionsForSeed(seed);
      const a = runCareer(config, world, scriptedChooser(decisions));
      const b = runCareer(config, world, scriptedChooser(decisions));
      expect(JSON.stringify(b), `seed ${seed} diverged`).toBe(JSON.stringify(a));
    }
  });

  it('produces different careers for different seeds', () => {
    const decisions = decisionsForSeed(1);
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const career = runCareer(configForSeed(seed, { position: 'ST', nationId: 'eng' }), world, scriptedChooser(decisions));
      signatures.add(`${career.totals.goals}:${career.peakOvr}:${career.seasons.length}:${career.totals.appearances}`);
    }
    // Not a determinism requirement as such, but a stream that collapsed to one
    // value would satisfy every other test in this file.
    expect(signatures.size).toBeGreaterThan(40);
  });

  it('changes the career when a single decision changes', () => {
    const config = configForSeed(77);
    const base = decisionsForSeed(77);
    const altered = [...base];
    altered[0] = (base[0]! + 1) % 4;

    const a = runCareer(config, world, scriptedChooser(base));
    const b = runCareer(config, world, scriptedChooser(altered));
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });
});

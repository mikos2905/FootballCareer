import { describe, expect, it } from 'vitest';
import { runCareer } from '../src/engine/career';
import { coverageGaps, coverageMatrix } from '../src/engine/decisions/coverage';
import { CARDS } from '../src/engine/decisions/registry';
import { STAGES } from '../src/engine/decisions/types';
import { TIER_LABELS, type EndingTier } from '../src/engine/endings';
import { STRATEGY_NAMES, type StrategyName } from '../src/engine/strategies';
import { configForSeed, strategyPolicy, world } from './helpers';

/**
 * Phase 5: the set as a whole.
 *
 * The per-card checks live in balance.test.ts. These are the properties that
 * only exist once there are sixty cards rather than ten — that every stage has
 * something to say, that careers end in more than one way, that the three
 * strategies are genuinely alternatives, and that two runs do not repeat.
 */

function careersFor(count: number, strategy: StrategyName | 'mixed', startSeed = 1) {
  return Array.from({ length: count }, (_, i) => {
    const seed = startSeed + i;
    const config = configForSeed(seed);
    const name = strategy === 'mixed' ? STRATEGY_NAMES[seed % STRATEGY_NAMES.length]! : strategy;
    return runCareer(config, world, strategyPolicy(name, seed));
  });
}

describe('coverage', () => {
  it('has a card for every stage and category, or a documented reason', () => {
    expect(coverageGaps().map((c) => `${c.stage}:${c.category}`)).toEqual([]);
  });

  it('documents only cells that are actually empty', () => {
    // An exemption left behind after a card was written for the cell is a lie
    // in the matrix, and the matrix is the thing we read to trust the set.
    const stale = coverageMatrix()
      .filter((c) => c.cards.length > 0 && c.exemptReason !== null)
      .map((c) => `${c.stage}:${c.category}`);
    expect(stale).toEqual([]);
  });

  it('serves every stage', () => {
    for (const stage of STAGES) {
      const eligible = CARDS.filter((c) => c.stages.includes(stage));
      expect(eligible.length, `${stage} has too little to say`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('endings', () => {
  const careers = careersFor(600, 'mixed');
  const counts = new Map<EndingTier, number>();
  for (const c of careers) counts.set(c.ending.tier, (counts.get(c.ending.tier) ?? 0) + 1);

  it('reaches every tier', () => {
    const missing = (Object.keys(TIER_LABELS) as EndingTier[]).filter((t) => !counts.has(t));
    expect(missing).toEqual([]);
  });

  it('keeps every tier inside the band', () => {
    // The brief's band is 2-40% over ten thousand runs. This sample is far
    // smaller, so the band is widened to catch a tier that has collapsed or
    // swallowed the distribution rather than one that has drifted.
    const out: string[] = [];
    for (const [tier, n] of counts) {
      const share = n / careers.length;
      if (share < 0.015 || share > 0.45) out.push(`${tier} ${(share * 100).toFixed(1)}%`);
    }
    expect(out).toEqual([]);
  });

  it('does not decide the tier from the score alone', () => {
    // The point of pattern-matched endings: a good score can still be told it
    // was wasted. If that never happens the tiers are score bands wearing a
    // disguise.
    const wasted = careers.filter((c) => c.ending.tier === 'what-might-have-been');
    const median = [...careers].map((c) => c.ending.careerScore).sort((a, b) => a - b)[
      Math.floor(careers.length / 2)
    ]!;
    expect(wasted.some((c) => c.ending.careerScore >= median)).toBe(true);
  });
});

describe('verdicts', () => {
  const careers = careersFor(40, 'mixed');

  it('names the actual career rather than a stock paragraph', () => {
    for (const career of careers) {
      const clubs = new Set(career.seasons.map((s) => world.club(s.clubId).name));
      const named = [...clubs].some((name) => career.ending.verdict.includes(name));
      expect(named, `verdict for seed ${career.config.seedLabel} names no club`).toBe(true);
    }
  });

  it('does not read the same twice', () => {
    const verdicts = careers.map((c) => c.ending.verdict);
    expect(new Set(verdicts).size).toBe(verdicts.length);
  });

  it('reveals the hidden ceiling', () => {
    for (const career of careers) {
      expect(career.ending.ceilingOvr).toBeGreaterThan(0);
    }
  });
});

describe('repetition', () => {
  const careers = careersFor(30, 'mixed');

  /**
   * The two cards allowed to recur, and why.
   *
   * Everything else is once per career: with sixty-one cards and eighteen
   * decisions, a repeat is the moment a run stops feeling like a life and
   * starts feeling like a deck.
   */
  const MAY_RECUR = new Set([
    // The fallback. It exists so a season with nothing eligible is not silent.
    'seasonal-outlook',
    // The retirement beat comes due again every couple of seasons once the
    // window opens, and something has to be able to answer it every time. The
    // five twilight cards that also answer it are once per career.
    'testimonial-or-one-more',
  ]);

  /**
   * Cards that answer a scripted beat appear in most careers by design: phase 1
   * guarantees those beats fire whatever the seed does, so the card answering
   * the first contract is in every run. That is the beat working, not the draw
   * being narrow.
   */
  const scheduled = new Set(CARDS.filter((c) => c.beat !== undefined).map((c) => c.id));

  it('shows no card twice in one career', () => {
    const repeats: string[] = [];
    for (const career of careers) {
      const seen = new Set<string>();
      for (const d of career.decisions) {
        if (MAY_RECUR.has(d.cardId)) continue;
        if (seen.has(d.cardId)) repeats.push(`${career.config.seedLabel}:${d.cardId}`);
        seen.add(d.cardId);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('does not lean on the same handful of cards every run', () => {
    const runs = new Map<string, number>();
    for (const career of careers) {
      for (const id of new Set(career.decisions.map((d) => d.cardId))) {
        runs.set(id, (runs.get(id) ?? 0) + 1);
      }
    }
    const everywhere = [...runs]
      .filter(([id, n]) => !scheduled.has(id) && !MAY_RECUR.has(id) && n / careers.length > 0.6)
      .map(([id, n]) => `${id} in ${n}/${careers.length}`);
    expect(everywhere).toEqual([]);
  });
});

describe('strategies', () => {
  const scores = new Map<StrategyName, number[]>();
  for (const name of STRATEGY_NAMES) {
    scores.set(name, careersFor(220, name).map((c) => c.ending.careerScore));
  }

  it('leaves no strategy dominating the others', () => {
    // Overlap measured as the share of one strategy's careers landing inside
    // another's interquartile range. If the idol path scores nowhere near the
    // mercenary path, the second win condition is decoration.
    const names = [...scores.keys()];
    const thin: string[] = [];
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue;
        const other = [...scores.get(b)!].sort((x, y) => x - y);
        const lo = other[Math.floor(other.length * 0.25)]!;
        const hi = other[Math.floor(other.length * 0.75)]!;
        const inside = scores.get(a)!.filter((v) => v >= lo && v <= hi).length / scores.get(a)!.length;
        if (inside < 0.25) thin.push(`${a} vs ${b}: ${(inside * 100).toFixed(0)}%`);
      }
    }
    expect(thin).toEqual([]);
  });

  it('keeps the mean scores close together', () => {
    const means = [...scores.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(12);
  });
});

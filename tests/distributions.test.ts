import { describe, expect, it } from 'vitest';
import { runCareer } from '../src/engine/career';
import { isCareerAltering } from '../src/engine/injuries';
import { LEAGUE_MATCHES } from '../src/engine/minutes';
import { POSITION_IDS } from '../src/engine/positions';
import { computeOvr } from '../src/engine/ratings';
import { Rng } from '../src/engine/rng';
import { makePolicy, STRATEGY_NAMES } from '../src/engine/strategies';
import { ATTRIBUTE_KEYS, MAX_AGE, MIN_AGE } from '../src/engine/types';
import { configForSeed, world } from './helpers';

/**
 * The regression guard for phase 2's tuning.
 *
 * Bands here are deliberately wider than the targets the harness reports
 * against — this is here to catch a change that breaks the shape of the game,
 * not to pin every constant in place. Run `npm run sim` for the real numbers.
 */

const SAMPLE = 900;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

const careers = Array.from({ length: SAMPLE }, (_, i) => {
  const seed = i + 1;
  const config = configForSeed(seed);
  const strategy = new Rng(seed ^ 0x57a7).pick(STRATEGY_NAMES);
  return runCareer(config, world, makePolicy(strategy, seed));
});

describe('career shape', () => {
  it('never ends before age 20 and never runs past 40', () => {
    for (const career of careers) {
      const last = career.seasons[career.seasons.length - 1];
      expect(last, `seed ${career.seed} played no seasons`).toBeDefined();
      expect(career.endAge, `seed ${career.seed} ended too young`).toBeGreaterThanOrEqual(20);
      expect(career.endAge, `seed ${career.seed} ran too long`).toBeLessThanOrEqual(MAX_AGE + 1);
      expect(last!.age, `seed ${career.seed} ran too long`).toBeLessThanOrEqual(MAX_AGE);
      expect(career.seasons[0]!.age).toBe(MIN_AGE);
    }
  });

  it('has a median length in the right region with a tail of early endings', () => {
    const lengths = careers.map((c) => c.seasons.length);
    expect(percentile(lengths, 0.5)).toBeGreaterThanOrEqual(14);
    expect(percentile(lengths, 0.5)).toBeLessThanOrEqual(20);
    // The tail: some careers really do end early. It is thin, because nothing
    // ends a career before 20 and clubs are patient with the young.
    expect(lengths.filter((l) => l <= 10).length / lengths.length).toBeGreaterThan(0.01);
  });

  it('keeps 90+ rare and 95+ rarer', () => {
    const over90 = careers.filter((c) => c.peakOvr >= 90).length / careers.length;
    const over95 = careers.filter((c) => c.peakOvr >= 95).length / careers.length;
    expect(over90).toBeLessThan(0.06);
    expect(over95).toBeLessThan(0.025);
    // But the top of the game has to be reachable, or the ceiling means nothing.
    expect(careers.some((c) => c.peakOvr >= 88)).toBe(true);
  });

  it('gives every career at least one injury, and few career-altering ones', () => {
    expect(careers.every((c) => c.injuries.length >= 1)).toBe(true);
    const altered = careers.filter((c) => c.injuries.some(isCareerAltering)).length / careers.length;
    expect(altered).toBeGreaterThan(0.02);
    expect(altered).toBeLessThan(0.15);
  });

  it('spreads players across three to five clubs on average', () => {
    const clubs = careers.map((c) => c.totals.clubsPlayedFor);
    expect(percentile(clubs, 0.5)).toBeGreaterThanOrEqual(2);
    expect(percentile(clubs, 0.5)).toBeLessThanOrEqual(6);
  });

  it('keeps big-five football a minority experience, and rarer for a quick start', () => {
    const big5 = new Set(['eng.pl', 'esp.l1', 'ita.sa', 'ger.b1', 'fra.l1']);
    const reached = (subset: typeof careers) =>
      subset.length === 0
        ? 0
        : subset.filter((c) => c.seasons.some((s) => big5.has(s.leagueId) && s.minutes >= 900)).length /
          subset.length;

    // Split by creation mode. "Draft your ceiling" is deliberately the stronger
    // of the two, so blending them hides both numbers.
    const quick = careers.filter((c) => !c.config.draftPicks);
    const drafted = careers.filter((c) => c.config.draftPicks);
    expect(quick.length).toBeGreaterThan(100);
    expect(drafted.length).toBeGreaterThan(100);

    expect(reached(quick)).toBeGreaterThan(0.1);
    expect(reached(quick)).toBeLessThan(0.38);
    // A drafted ceiling should visibly buy you a better career.
    expect(reached(drafted)).toBeGreaterThan(reached(quick));
  });
});

describe('per-season invariants', () => {
  it('keeps every recorded season internally consistent', () => {
    for (const career of careers) {
      for (const s of career.seasons) {
        expect(s.appearances, `seed ${career.seed}`).toBe(s.starts + s.substituteAppearances);
        expect(s.minutes).toBeGreaterThanOrEqual(0);
        // Nobody plays more minutes than there are matches to play them in.
        const ceiling = (LEAGUE_MATCHES + 4 + 8) * 90;
        expect(s.minutes, `seed ${career.seed} season ${s.season}`).toBeLessThanOrEqual(ceiling);
        expect(s.goals).toBeGreaterThanOrEqual(0);
        expect(s.assists).toBeGreaterThanOrEqual(0);
        if (s.minutes === 0) {
          expect(s.goals).toBe(0);
          expect(s.assists).toBe(0);
        }
        expect(s.averageRating === 0 || (s.averageRating >= 5 && s.averageRating <= 9)).toBe(true);
        expect(s.ovrEnd).toBeGreaterThanOrEqual(1);
        expect(s.ovrEnd).toBeLessThanOrEqual(99);
        expect(s.leaguePosition).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps attributes and OVR on the 1-99 scale, with OVR derived not stored', () => {
    for (const career of careers) {
      for (const key of ATTRIBUTE_KEYS) {
        expect(career.player.attributes[key]).toBeGreaterThanOrEqual(1);
        expect(career.player.attributes[key]).toBeLessThanOrEqual(99);
      }
      expect(career.player.ovr).toBe(computeOvr(career.player.attributes, career.player.position));
    }
  });

  it('never scores at a rate no footballer has sustained', () => {
    // A substitute banging in a few in a short spell is a good story; a rate
    // like that over most of a season is not football.
    for (const career of careers) {
      for (const s of career.seasons) {
        const ninetys = s.minutes / 90;
        // Seventeen in ten games is a hot streak and has happened; the real
        // guard is the rate sustained over most of a season, below.
        if (ninetys >= 10) {
          expect(s.goals / ninetys, `seed ${career.seed} season ${s.season}`).toBeLessThan(1.9);
        }
        // Over a full season the bound is the best anyone has managed: Messi's
        // 2011-12 was 1.35 goals per 90 across fifty-odd games.
        if (ninetys >= 25) {
          expect(s.goals / ninetys, `seed ${career.seed} season ${s.season}`).toBeLessThan(1.45);
        }
      }
    }
  });
});

describe('goalkeepers', () => {
  const keepers = Array.from({ length: 140 }, (_, i) => {
    const seed = 5000 + i;
    return runCareer(configForSeed(seed, { position: 'GK' }), world, makePolicy('balanced', seed));
  });

  it('are modelled on clean sheets rather than goals and assists', () => {
    for (const career of keepers) {
      expect(career.totals.goals).toBe(0);
      for (const s of career.seasons) {
        expect(s.goals).toBe(0);
        expect(s.assists).toBe(0);
        expect(s.keeper, `seed ${career.seed} season ${s.season}`).not.toBeNull();
        // Keepers play the whole match or none of it.
        expect(s.substituteAppearances).toBe(0);
        expect(s.keeper!.cleanSheets).toBeLessThanOrEqual(s.starts);
        expect(s.keeper!.saves).toBeLessThanOrEqual(s.keeper!.shotsFaced);
        if (s.starts > 0) {
          expect(s.keeper!.savePercentage).toBeGreaterThan(0.35);
          expect(s.keeper!.savePercentage).toBeLessThan(0.95);
        }
      }
    }
  });

  it('produce plausible clean sheet rates', () => {
    const rates = keepers
      .flatMap((c) => c.seasons)
      .filter((s) => s.starts >= 20)
      .map((s) => s.keeper!.cleanSheets / s.starts);
    expect(rates.length).toBeGreaterThan(50);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean).toBeGreaterThan(0.12);
    expect(mean).toBeLessThan(0.5);
  });
});

describe('outfield positions', () => {
  it('gives no position a systematic ceiling advantage', () => {
    const byPosition = POSITION_IDS.map((pos) => {
      const sample = Array.from({ length: 90 }, (_, i) => {
        const seed = 9000 + i;
        return runCareer(configForSeed(seed, { position: pos }), world, makePolicy('balanced', seed));
      });
      return {
        pos,
        ceiling: sample.reduce((a, c) => a + c.ending.ceilingOvr, 0) / sample.length,
      };
    });
    const ceilings = byPosition.map((p) => p.ceiling);
    const spread = Math.max(...ceilings) - Math.min(...ceilings);
    // A goalkeeper's rating leans on two attributes and a winger's on five;
    // without normalising for that, keepers come out several points stronger.
    expect(spread, JSON.stringify(byPosition)).toBeLessThan(4);
  });
});

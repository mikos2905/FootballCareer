import { WORLD_DATA } from '../../src/data';
import { runCareer, type Career } from '../../src/engine/career';
import { OUTFIELD_POSITION_IDS, POSITION_IDS } from '../../src/engine/positions';
import { Rng } from '../../src/engine/rng';
import { makePolicy, STRATEGY_NAMES, type StrategyName } from '../../src/engine/strategies';
import { isCareerAltering, isLongLayoff } from '../../src/engine/injuries';
import type { CareerConfig, Cadence, Foot, PositionId } from '../../src/engine/types';
import { buildWorld, validateWorld } from '../../src/engine/world';

const problems = validateWorld(WORLD_DATA);
if (problems.length > 0) {
  throw new Error(`world data is invalid:\n  ${problems.join('\n  ')}`);
}
export const world = buildWorld(WORLD_DATA);

export interface RunOptions {
  seeds: number;
  startSeed: number;
  position: PositionId | 'mixed' | 'outfield';
  strategy: StrategyName | 'mixed';
  nation: string | 'mixed';
  cadence: Cadence;
}

const FEET: Foot[] = ['left', 'right'];

export function configFor(seed: number, options: RunOptions): CareerConfig {
  // A throwaway stream: choosing what to simulate must never touch the career's own.
  const rng = new Rng(seed ^ 0xc0ffee);

  const position: PositionId =
    options.position === 'mixed'
      ? rng.pick(POSITION_IDS)
      : options.position === 'outfield'
        ? rng.pick(OUTFIELD_POSITION_IDS)
        : options.position;

  const nationId = options.nation === 'mixed' ? rng.pick(WORLD_DATA.nations).id : options.nation;

  return {
    seed,
    seedLabel: String(seed),
    cadence: options.cadence,
    surname: `Seed${seed}`,
    shirtNumber: rng.int(1, 99),
    foot: rng.pick(FEET),
    nationId,
    position,
  };
}

export function strategyFor(seed: number, options: RunOptions): StrategyName {
  if (options.strategy !== 'mixed') return options.strategy;
  return new Rng(seed ^ 0x57a7).pick(STRATEGY_NAMES);
}

export function runOne(seed: number, options: RunOptions): Career {
  const config = configFor(seed, options);
  return runCareer(config, world, makePolicy(strategyFor(seed, options), seed));
}

export function runMany(options: RunOptions, onProgress?: (done: number) => void): Career[] {
  const out: Career[] = [];
  for (let i = 0; i < options.seeds; i += 1) {
    out.push(runOne(options.startSeed + i, options));
    if (onProgress && (i + 1) % 500 === 0) onProgress(i + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface CareerMetrics {
  seasons: number;
  peakOvr: number;
  finalOvr: number;
  ceilingOvr: number;
  realisation: number;
  goals: number;
  assists: number;
  appearances: number;
  peakSeasonGoals: number;
  peakValue: number;
  clubs: number;
  trophies: number;
  caps: number;
  injuries: number;
  careerAlteringInjuries: number;
  longLayoffs: number;
  reachedTopTier: boolean;
  topTierSeasons: number;
  /** Any tier-1 division anywhere, with real minutes. */
  reachedAnyTopFlight: boolean;
  retirementAge: number;
  peakAge: number;
}

export function metricsFor(career: Career): CareerMetrics {
  const seasons = career.seasons;
  const peakSeasonGoals = seasons.reduce((max, s) => Math.max(max, s.goals), 0);
  // "Reached a top-tier league" means actually played there, not sat on the
  // bench of a club that happened to be in one.
  const topTierSeasons = seasons.filter(
    (s) => world.league(s.leagueId).strength >= 0.85 && s.minutes >= 900,
  ).length;
  return {
    seasons: seasons.length,
    peakOvr: career.peakOvr,
    finalOvr: career.player.ovr,
    ceilingOvr: career.ending.ceilingOvr,
    realisation: career.ending.realisation,
    goals: career.totals.goals,
    assists: career.totals.assists,
    appearances: career.totals.appearances,
    peakSeasonGoals,
    peakValue: career.peakMarketValue,
    clubs: career.totals.clubsPlayedFor,
    trophies: career.totals.trophyCount,
    caps: career.totals.caps,
    injuries: career.injuries.length,
    careerAlteringInjuries: career.injuries.filter(isCareerAltering).length,
    longLayoffs: career.injuries.filter(isLongLayoff).length,
    reachedTopTier: topTierSeasons > 0,
    topTierSeasons,
    reachedAnyTopFlight: seasons.some((s) => s.leagueTier === 1 && s.minutes >= 900),
    retirementAge: seasons[seasons.length - 1]?.age ?? 16,
    peakAge: career.peakAge,
  };
}

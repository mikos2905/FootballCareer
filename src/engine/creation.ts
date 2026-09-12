import { archetype } from './archetypes';
import { position } from './positions';
import { computeMarketValue, computeOvr, computeWage } from './ratings';
import { clamp, Rng } from './rng';
import {
  ATTRIBUTE_KEYS,
  type Attributes,
  type CareerConfig,
  type CareerState,
  type Club,
  type PositionId,
} from './types';
import type { World } from './world';

export const STARTING_AGE = 16;

/** Presentation order for the draft. Seeded, so a shared seed drafts the same run. */
export function draftOrder(seed: number, archetypeIds: readonly string[]): string[] {
  return new Rng(seed ^ 0x5eed1e).shuffled(archetypeIds);
}

const blankAttributes = (): Attributes => ({
  pace: 0,
  shooting: 0,
  passing: 0,
  dribbling: 0,
  defending: 0,
  physical: 0,
  flair: 0,
  weakFoot: 0,
});

/**
 * The hidden ceiling.
 *
 * Drafted careers get the hybrid the player assembled; quick starts get a
 * positional shape around a seeded overall talent level. Either way the seed
 * jitters it, so the same draft on two seeds is not the same player.
 *
 * This number is never shown during a run. It surfaces as coach dialogue hints,
 * and in full on the end screen.
 */
function deriveCeiling(rng: Rng, config: CareerConfig, pos: PositionId): Attributes {
  const ceiling = blankAttributes();
  const weights = position(pos).weights;

  if (config.draftPicks && config.draftPicks.length > 0) {
    const taken = new Map(config.draftPicks.map((p) => [p.attribute, p.archetypeId]));
    for (const key of ATTRIBUTE_KEYS) {
      const from = taken.get(key);
      // An attribute the player never got to pick falls back to a modest baseline.
      const offered = from ? archetype(from).offers[key] : 58;
      ceiling[key] = offered;
    }
  } else {
    const talent = rng.around(72, 9, 48, 94);
    for (const key of ATTRIBUTE_KEYS) {
      ceiling[key] = talent + ((weights[key] ?? 0) - 1 / ATTRIBUTE_KEYS.length) * 90;
    }
  }

  for (const key of ATTRIBUTE_KEYS) {
    const jitter = rng.around(0, config.draftPicks ? 3 : 4.5, -9, 9);
    ceiling[key] = clamp(Math.round(ceiling[key] + jitter), 28, 99);
  }
  return ceiling;
}

/** Where a 16-year-old actually is, relative to where he could end up. */
function deriveStartingAttributes(rng: Rng, ceiling: Attributes): Attributes {
  const maturity = rng.around(0.52, 0.05, 0.4, 0.66);
  const attributes = blankAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    const raw = ceiling[key] * maturity + rng.around(0, 3.5, -7, 7);
    attributes[key] = clamp(Math.round(raw), 18, Math.min(70, ceiling[key]));
  }
  return attributes;
}

/**
 * First club. Nationality decides which leagues come looking; how good the kid
 * already is decides how high up he lands.
 */
function pickFirstClub(rng: Rng, world: World, nationId: string, ovr: number): Club {
  const nation = world.nation(nationId);
  const leagues = nation.homeLeagueIds.map((id) => world.league(id));
  const target = 30 + ovr * 0.75;
  const league = rng.weighted(leagues, (l) => 1 / (1 + Math.abs(l.strength - target) / 8));

  const clubs = world.clubsInLeague(league.id);
  if (clubs.length === 0) throw new Error(`League ${league.id} has no clubs`);
  const average = clubs.reduce((sum, c) => sum + c.strength, 0) / clubs.length;
  // Academy graduates mostly come through at unglamorous clubs.
  const clubTarget = average - 6 + (ovr - 48) * 0.6;
  return rng.weighted(clubs, (c) => 1 / (1 + Math.abs(c.strength - clubTarget) / 6));
}

/** Consumes the head of the career's single RNG stream. The caller owns the Rng. */
export function createCareer(
  rng: Rng,
  config: CareerConfig,
  world: World,
  startYear = 2025,
): CareerState {
  const ceiling = deriveCeiling(rng, config, config.position);
  const attributes = deriveStartingAttributes(rng, ceiling);
  const ovr = computeOvr(attributes, config.position);

  const club = pickFirstClub(rng, world, config.nationId, ovr);
  const league = world.league(club.leagueId);

  const injuryProneness = Math.round(rng.around(30, 11, 6, 72));
  const reputation = Math.round(rng.around(8, 2.5, 3, 16));

  const marketValue = computeMarketValue({
    ovr,
    age: STARTING_AGE,
    reputation,
    leaguePrestige: league.prestige,
    clubPrestige: club.prestige,
    contractYearsRemaining: 3,
  });
  const wage = computeWage({ ovr, wageBudget: club.wageBudget, reputation, age: STARTING_AGE });

  return {
    seed: config.seed,
    seedLabel: config.seedLabel,
    cadence: config.cadence,
    season: 0,
    year: startYear,
    player: {
      surname: config.surname,
      shirtNumber: config.shirtNumber,
      foot: config.foot,
      nationId: config.nationId,
      position: config.position,
      age: STARTING_AGE,
      attributes,
      ceiling,
      ovr,
      marketValue,
      reputation,
    },
    clubId: club.id,
    parentClubId: null,
    contractYearsRemaining: 3,
    wage,
    condition: {
      injuryProneness,
      wear: 0,
      form: 0,
      injuryWeeks: 0,
    },
    clubStandings: [
      {
        clubId: club.id,
        // A boy who came through the academy starts with some goodwill in the bank.
        standing: 32,
        seasonsServed: 0,
        appearances: 0,
        goals: 0,
        assists: 0,
        trophiesWon: 0,
        leftForMoney: false,
      },
    ],
    national: {
      nationId: null,
      caps: 0,
      goals: 0,
      standing: 0,
      tournamentsPlayed: 0,
      tournamentsWon: 0,
      committed: false,
    },
    trophies: [],
    seasons: [],
    decisions: [],
    poorSeasonStreak: 0,
    peakOvr: ovr,
    peakMarketValue: marketValue,
    retired: false,
    firedBeats: [],
    pending: [],
  };
}

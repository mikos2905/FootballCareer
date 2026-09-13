import { archetype } from './archetypes';
import { initialWorldState } from './league';
import { position, weightConcentration } from './positions';
import { computeOvr } from './ratings';
import { computeMarketValue, computeWage } from './transfers';
import { clamp, Rng } from './rng';
import {
  ATTRIBUTE_KEYS,
  MIN_AGE,
  type Attributes,
  type CareerConfig,
  type CareerState,
  type Club,
  type PositionId,
} from './types';
import type { World } from './world';

export const STARTING_AGE = MIN_AGE;

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
    // Right-skewed rather than normal: the median academy graduate tops out
    // as a lower-league professional, and the tail that reaches the very top is
    // thin but it has to exist.
    const talent = 39 + 22 * Math.exp(rng.around(0, 1, -2.4, 2.4) * 0.37);
    // Shape the ceiling around the position, normalised so that the resulting
    // ceiling OVR is the same for a goalkeeper and a winger of equal talent.
    const spread = 4 / weightConcentration(pos);
    for (const key of ATTRIBUTE_KEYS) {
      ceiling[key] = talent + ((weights[key] ?? 0) - 1 / ATTRIBUTE_KEYS.length) * spread;
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
  const maturity = rng.around(0.58, 0.05, 0.45, 0.72);
  const attributes = blankAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    const raw = ceiling[key] * maturity + rng.around(0, 3.5, -7, 7);
    // Floored: anyone holding a professional contract at sixteen is already a
    // footballer. Without this, a low-ceiling player starts in the twenties,
    // which is not a level at which anyone gets signed.
    attributes[key] = clamp(Math.round(raw), 30, Math.min(70, Math.max(ceiling[key], 30)));
  }
  return attributes;
}

/**
 * First club.
 *
 * Nationality decides which leagues come looking; how good the kid already is
 * decides how high up he lands. He is picked against club strength directly —
 * league strength is a difficulty multiplier, not a 1-99 rating, and comparing
 * the two is how you end up with every sixteen-year-old at a top-flight club.
 */
function pickFirstClub(rng: Rng, world: World, nationId: string, ovr: number): Club {
  const nation = world.nation(nationId);
  const clubs = nation.homeLeagueIds.flatMap((id) => world.clubsInLeague(id));
  if (clubs.length === 0) throw new Error(`Nation ${nationId} has no clubs to start at`);

  // Academy graduates come through at clubs near their own level. A better kid
  // gets picked up by a better club; almost nobody starts at a giant.
  const target = clamp(40 + (ovr - 45) * 1.5, 28, 88);
  return rng.weighted(clubs, (c) => 1 / (1 + Math.abs(c.strength - target) / 6.5));
}

/** Consumes the head of the creation substream. The caller owns the Rng. */
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
  // Peak age varies by position and by seed, a few years either side of the
  // positional base. Two strikers on two seeds do not age the same way.
  const peakAge = clamp(
    Math.round(rng.around(position(config.position).peakAge, 1.5, 23, 33) * 2) / 2,
    23,
    33,
  );

  const marketValue = computeMarketValue({
    ovr,
    age: STARTING_AGE,
    reputation,
    leaguePrestige: league.prestige,
    leagueStrength: league.strength,
    contractYearsRemaining: 3,
    recentOutput: 1,
  });
  const wage = computeWage({
    ovr,
    wageBudget: club.wageBudget,
    reputation,
    age: STARTING_AGE,
    role: 'fringe',
  });

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
      peakAge,
      ovr,
      marketValue,
      reputation,
    },
    world: initialWorldState(world.data),
    clubId: club.id,
    parentClubId: null,
    // A first professional deal, drawn so that expiries are not synchronised
    // across every career.
    contractYearsRemaining: rng.int(2, 4),
    wage,
    condition: {
      injuryProneness,
      wear: 0,
      form: 0,
      managerRelationship: 0,
    },
    suppression: 0,
    clubStandings: [
      {
        clubId: club.id,
        // A boy who came through the academy starts with goodwill in the bank.
        standing: 32,
        goodwill: 6,
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
      bestFinish: null,
      committed: false,
    },
    trophies: [],
    injuries: [],
    seasons: [],
    decisions: [],
    barrenSeasons: 0,
    peakOvr: ovr,
    peakMarketValue: marketValue,
    retired: false,
    endReason: null,
    firedBeats: [],
    pending: [],
    modifiers: [],
    cardHistory: [],
  };
}

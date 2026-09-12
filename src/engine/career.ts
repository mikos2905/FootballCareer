import { dueBeats, markFired, mustRetire, type BeatId } from './beats';
import { createCareer } from './creation';
import { computeEnding, computeTotals, type CareerTotals, type Ending } from './endings';
import { displayAttributes } from './development';
import { simulateInternationalSeason } from './international';
import { computeMarketValue, computeOvr, computeWage } from './ratings';
import { clamp, Rng } from './rng';
import { simulateSeason, type SeasonModifiers } from './season';
import {
  DECISION_DEFS,
  queueDelayed,
  type DecisionCard,
  type DecisionDef,
  type OptionResolution,
} from './decisions';
import {
  ATTRIBUTE_KEYS,
  type CareerConfig,
  type CareerState,
  type ClubStanding,
  type DecisionRecord,
  type PlayerState,
  type SeasonRecord,
  type StateDelta,
  type TrophyWin,
} from './types';
import type { World } from './world';

/** Seasons between decision cards. Scripted beats fire regardless of this. */
export const CADENCE_INTERVAL = { full: 1, standard: 2, express: 3 } as const;

export interface DecisionRequest {
  season: number;
  year: number;
  age: number;
  card: DecisionCard;
  /** Beat that summoned this card, if any. */
  beat: BeatId | null;
  state: CareerState;
}

/** Returns the index of the chosen option. Must not consume randomness. */
export type Chooser = (request: DecisionRequest) => number;

/** Replays a fixed list of option indices. Out-of-range and exhausted lists fall back to 0. */
export function scriptedChooser(indices: readonly number[]): Chooser {
  let i = 0;
  return ({ card }) => {
    const raw = indices[i] ?? 0;
    i += 1;
    return ((raw % card.options.length) + card.options.length) % card.options.length;
  };
}

export interface Career {
  seed: number;
  seedLabel: string;
  config: CareerConfig;
  player: PlayerState;
  seasons: SeasonRecord[];
  decisions: DecisionRecord[];
  trophies: TrophyWin[];
  clubStandings: ClubStanding[];
  national: CareerState['national'];
  totals: CareerTotals;
  peakOvr: number;
  peakMarketValue: number;
  ending: Ending;
}

// ---------------------------------------------------------------------------
// Applying declarative effects
// ---------------------------------------------------------------------------

function standingFor(state: CareerState, clubId: string): ClubStanding {
  let found = state.clubStandings.find((c) => c.clubId === clubId);
  if (!found) {
    found = {
      clubId,
      standing: 20,
      seasonsServed: 0,
      appearances: 0,
      goals: 0,
      assists: 0,
      trophiesWon: 0,
      leftForMoney: false,
    };
    state.clubStandings.push(found);
  }
  return found;
}

/**
 * Applies a delta. Additive for the 0-100 dimensions, multiplicative for money,
 * absolute for contract length, and carried into next season for the two
 * factors. Nothing here may push an attribute past the hidden ceiling.
 */
function applyDelta(state: CareerState, delta: StateDelta, modifiers: SeasonModifiers): void {
  const { player } = state;

  if (delta.attributes) {
    for (const key of ATTRIBUTE_KEYS) {
      const change = delta.attributes[key];
      if (change === undefined) continue;
      player.attributes[key] = clamp(player.attributes[key] + change, 1, player.ceiling[key]);
    }
  }
  if (delta.ceiling) {
    for (const key of ATTRIBUTE_KEYS) {
      const change = delta.ceiling[key];
      if (change === undefined) continue;
      player.ceiling[key] = clamp(player.ceiling[key] + change, 1, 99);
    }
  }

  if (delta.reputation !== undefined) player.reputation = clamp(player.reputation + delta.reputation, 0, 100);
  if (delta.form !== undefined) state.condition.form = clamp(state.condition.form + delta.form, -20, 20);
  if (delta.wear !== undefined) state.condition.wear = clamp(state.condition.wear + delta.wear, 0, 100);
  if (delta.injuryProneness !== undefined) {
    state.condition.injuryProneness = clamp(state.condition.injuryProneness + delta.injuryProneness, 1, 100);
  }
  if (delta.clubStanding !== undefined) {
    const standing = standingFor(state, state.clubId);
    standing.standing = clamp(standing.standing + delta.clubStanding, 0, 100);
  }
  if (delta.nationalStanding !== undefined) {
    state.national.standing = clamp(state.national.standing + delta.nationalStanding, 0, 100);
  }
  if (delta.contractYears !== undefined) state.contractYearsRemaining = Math.max(0, delta.contractYears);
  if (delta.wage !== undefined) state.wage = Math.round(state.wage * delta.wage);
  if (delta.marketValue !== undefined) player.marketValue = Math.round(player.marketValue * delta.marketValue);
  if (delta.minutesFactor !== undefined) modifiers.minutesFactor *= delta.minutesFactor;
  if (delta.developmentFactor !== undefined) modifiers.developmentFactor *= delta.developmentFactor;
}

function applyMove(state: CareerState, world: World, resolution: OptionResolution): void {
  const move = resolution.move;
  if (!move) return;
  const leaving = standingFor(state, state.clubId);
  if (move.reason === 'money') {
    // Leaving for money is what costs you the statue.
    leaving.standing = clamp(leaving.standing - 28, 0, 100);
    leaving.leftForMoney = true;
  } else if (move.reason === 'ambition') {
    leaving.standing = clamp(leaving.standing - 10, 0, 100);
  }

  state.parentClubId = move.loan ? state.clubId : null;
  state.clubId = move.clubId;
  state.contractYearsRemaining = move.contractYears;
  standingFor(state, move.clubId);

  const club = world.club(move.clubId);
  state.wage = computeWage({
    ovr: state.player.ovr,
    wageBudget: club.wageBudget,
    reputation: state.player.reputation,
    age: state.player.age,
  });
}

// ---------------------------------------------------------------------------
// Card selection
// ---------------------------------------------------------------------------

function selectCard(
  rng: Rng,
  state: CareerState,
  world: World,
  beats: readonly BeatId[],
): { def: DecisionDef; beat: BeatId | null } | null {
  const ctx = { state, world };

  // A due beat outranks the cadence card. Beats fire in priority order.
  for (const beat of beats) {
    const candidates = DECISION_DEFS.filter((d) => d.beats?.includes(beat) && d.available(ctx));
    if (candidates.length > 0) return { def: rng.pick(candidates), beat };
  }

  const general = DECISION_DEFS.filter((d) => !d.beats && d.available(ctx));
  if (general.length === 0) return null;
  return { def: rng.pick(general), beat: null };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export function runCareer(config: CareerConfig, world: World, chooser: Chooser): Career {
  const rng = new Rng(config.seed);
  const state = createCareer(rng, config, world);

  while (!state.retired) {
    const modifiers: SeasonModifiers = { minutesFactor: 1, developmentFactor: 1 };

    // 1. Effects queued by earlier decisions that land this season.
    const landing = state.pending.filter((p) => p.dueSeason === state.season);
    state.pending = state.pending.filter((p) => p.dueSeason !== state.season);
    for (const p of landing) applyDelta(state, p.effect, modifiers);

    // 2. Decision, if one is owed.
    const beats = dueBeats(state, world);
    const cadenceDue = state.season % CADENCE_INTERVAL[state.cadence] === 0;
    if (beats.length > 0 || cadenceDue) {
      const selected = selectCard(rng, state, world, beats);
      if (selected) {
        const card = selected.def.build({ state, world });
        const index = chooser({
          season: state.season,
          year: state.year,
          age: state.player.age,
          card,
          beat: selected.beat,
          state,
        });
        const option = card.options[clamp(Math.trunc(index), 0, card.options.length - 1)];
        if (!option) throw new Error(`Card ${card.id} produced no options`);
        const resolution = option.resolve({ state, world });

        state.decisions.push({
          season: state.season,
          cardId: card.id,
          optionId: option.id,
          optionIndex: card.options.indexOf(option),
        });
        if (selected.beat) state.firedBeats = markFired(state, selected.beat);

        if (resolution.immediate) applyDelta(state, resolution.immediate, modifiers);
        state.pending.push(...queueDelayed(state, resolution, card.id));
        if (resolution.national) {
          state.national.nationId = resolution.national.nationId;
          state.national.committed = resolution.national.commit;
        }
        applyMove(state, world, resolution);
        if (resolution.focus) modifiers.focus = resolution.focus;
        if (resolution.retire) {
          state.retired = true;
          break;
        }
      }
    }

    // 3. Play the season.
    const outcome = simulateSeason(rng, state, world, modifiers);
    const international = simulateInternationalSeason(rng, state, world, outcome.record);

    const record: SeasonRecord = {
      ...outcome.record,
      caps: international.caps,
      internationalGoals: international.goals,
      trophies: international.trophy
        ? [...outcome.record.trophies, international.trophy]
        : outcome.record.trophies,
    };

    commitSeason(state, world, record, outcome.development.attributes, international.reputationDelta, international.standingDelta, outcome.poor);

    // 4. Time passes.
    state.season += 1;
    state.year += 1;
    state.player.age += 1;
    state.contractYearsRemaining = Math.max(0, state.contractYearsRemaining - 1);

    if (mustRetire(state)) state.retired = true;
  }

  const ending = computeEnding(state, world);
  return {
    seed: state.seed,
    seedLabel: state.seedLabel,
    config,
    player: { ...state.player, attributes: displayAttributes(state.player.attributes, state.player.ceiling) },
    seasons: state.seasons,
    decisions: state.decisions,
    trophies: state.trophies,
    clubStandings: state.clubStandings,
    national: state.national,
    totals: computeTotals(state, world),
    peakOvr: state.peakOvr,
    peakMarketValue: state.peakMarketValue,
    ending,
  };
}

function commitSeason(
  state: CareerState,
  world: World,
  record: SeasonRecord,
  attributes: CareerState['player']['attributes'],
  reputationDelta: number,
  nationalStandingDelta: number,
  poor: boolean,
): void {
  const club = world.club(state.clubId);
  const league = world.league(club.leagueId);

  state.player.attributes = attributes;
  state.player.ovr = computeOvr(attributes, state.player.position);

  // Reputation: what you did, where anyone could see it.
  const visibility = 0.55 + (league.prestige / 100) * 0.75;
  const output = record.goals * 0.42 + record.assists * 0.24;
  const trophyBump = record.trophies.reduce((sum, t) => sum + world.competition(t.competitionId).prestige / 22, 0);
  const gained = (output * visibility + trophyBump + (record.minutes / 2700) * 2.2) * 0.9 + reputationDelta;
  const decay = state.player.reputation * 0.06;
  state.player.reputation = clamp(state.player.reputation + gained - decay, 0, 100);

  state.national.standing = clamp(state.national.standing + nationalStandingDelta, 0, 100);
  state.national.caps += record.caps;
  state.national.goals += record.internationalGoals;
  for (const t of record.trophies) {
    if (t.clubId === null) {
      state.national.tournamentsWon += 1;
    }
  }

  state.player.marketValue = computeMarketValue({
    ovr: state.player.ovr,
    age: state.player.age + 1,
    reputation: state.player.reputation,
    leaguePrestige: league.prestige,
    clubPrestige: club.prestige,
    contractYearsRemaining: Math.max(0, state.contractYearsRemaining - 1),
  });
  state.wage = computeWage({
    ovr: state.player.ovr,
    wageBudget: club.wageBudget,
    reputation: state.player.reputation,
    age: state.player.age,
  });

  // Condition carries forward. Wear never fully comes off.
  state.condition.wear = clamp(
    state.condition.wear + (record.minutes / 2700) * 4.5 + record.injuryWeeks * 0.35 - 1.2,
    0,
    100,
  );
  state.condition.injuryWeeks = record.injuryWeeks;
  const formTarget = record.averageRating > 0 ? (record.averageRating - 6.6) * 14 : -4;
  state.condition.form = clamp(state.condition.form * 0.35 + formTarget * 0.65, -20, 20);
  if (record.injuryWeeks > 12) {
    state.condition.injuryProneness = clamp(state.condition.injuryProneness + 3.5, 1, 100);
  }

  const standing = standingFor(state, state.clubId);
  standing.seasonsServed += 1;
  standing.appearances += record.appearances;
  standing.goals += record.goals;
  standing.assists += record.assists;
  standing.trophiesWon += record.trophies.filter((t) => t.clubId !== null).length;
  // Standing is earned by service, by performance, and above all by staying.
  const served = Math.min(standing.seasonsServed, 12);
  const performance = record.averageRating > 0 ? (record.averageRating - 6.5) * 9 : -3;
  const loyalty = served * 1.35;
  const clubTrophies = record.trophies.filter((t) => t.clubId !== null).length * 6;
  standing.standing = clamp(standing.standing + loyalty + performance + clubTrophies, 0, 100);

  state.trophies.push(...record.trophies);
  state.seasons.push(record);
  state.peakOvr = Math.max(state.peakOvr, state.player.ovr);
  state.peakMarketValue = Math.max(state.peakMarketValue, state.player.marketValue);
  state.poorSeasonStreak = poor ? state.poorSeasonStreak + 1 : 0;
}

import { dueBeats, markFired, type BeatId } from './beats';
import { createCareer } from './creation';
import {
  applyDecision,
  decisionRng,
  drainQueue,
  expireModifiers,
  present,
  resolveModifiers,
  selectCard,
  type PresentedCard,
} from './decisions';
import { displayAttributes } from './development';
import { computeEnding, computeTotals, type CareerTotals, type Ending } from './endings';
import { simulateInternationalSeason } from './international';
import { advanceWorld, clubLeagueId, clubStrength } from './league';
import { computeOvr } from './ratings';
import { clamp, substream } from './rng';
import { recentOutputShare, simulateSeason, type SeasonModifiers } from './season';
import { computeMarketValue, generateLoanOffers, generateOffers, renewalOffer } from './transfers';
import {
  MAX_AGE,
  type CareerConfig,
  type CareerEndReason,
  type CareerState,
  type ClubStanding,
  type DecisionRecord,
  type Injury,
  type NationalRecord,
  type PlayerState,
  type SeasonRecord,
  type TransferOffer,
  type TrophyWin,
} from './types';
import type { World } from './world';
import type { TransferReason } from './decisions';
import type { AttributeKey } from './types';

/**
 * No career ends before this age, whatever happens. A teenager who cannot find
 * a club gets another year, and a bad injury at eighteen does its permanent
 * damage without finishing him.
 */
export const MIN_CAREER_END_AGE = 20;

/** Seasons between decision cards. Scripted beats fire regardless of this. */
export const CADENCE_INTERVAL = { full: 1, standard: 2, express: 3 } as const;

export interface DecisionRequest {
  season: number;
  year: number;
  age: number;
  card: PresentedCard;
  beat: BeatId | null;
  state: CareerState;
}

export interface TransferRequest {
  season: number;
  year: number;
  age: number;
  state: CareerState;
  offers: TransferOffer[];
  /** The current club's renewal, when they want to keep him. */
  renewal: TransferOffer | null;
  /** True when he is out of contract and has to go somewhere. */
  mustMove: boolean;
}

/** Returns the chosen option index. Must not consume randomness. */
export type Chooser = (request: DecisionRequest) => number;
/** Returns an index into `offers`, or -1 to stay put. Must not consume randomness. */
export type TransferPolicy = (request: TransferRequest) => number;

export interface CareerPolicy {
  decide: Chooser;
  transfer: TransferPolicy;
}

/** Replays a fixed list of option indices. Exhausted lists fall back to 0. */
export function scriptedChooser(indices: readonly number[]): Chooser {
  let i = 0;
  return ({ card }) => {
    const raw = indices[i] ?? 0;
    i += 1;
    return ((raw % card.options.length) + card.options.length) % card.options.length;
  };
}

/** Never moves unless forced out of the club. */
export const stayPutPolicy: TransferPolicy = ({ offers, mustMove }) => (mustMove && offers.length > 0 ? 0 : -1);

export interface Career {
  seed: number;
  seedLabel: string;
  config: CareerConfig;
  player: PlayerState;
  /** Hidden all run; revealed here. */
  peakAge: number;
  seasons: SeasonRecord[];
  decisions: DecisionRecord[];
  trophies: TrophyWin[];
  injuries: Injury[];
  clubStandings: ClubStanding[];
  national: NationalRecord;
  totals: CareerTotals;
  peakOvr: number;
  peakMarketValue: number;
  /** Age when the career ended — one past the final season for an attrition exit. */
  endAge: number;
  endReason: CareerEndReason;
  ending: Ending;
}

// ---------------------------------------------------------------------------
// Effects
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

/** Moves the player, and charges the reputational cost of how he left. */
function completeMove(
  state: CareerState,
  world: World,
  offer: TransferOffer,
  reason?: TransferReason,
): void {
  const leaving = standingFor(state, state.clubId);
  const fromStrength = clubStrength(state.world, state.clubId);
  const toStrength = clubStrength(state.world, offer.clubId);

  if (!offer.loan) {
    // Leaving a club that still had you under contract, for a side no better
    // than the one you left, reads as a move for money. That is what costs you
    // the statue. A card can say outright that this is what it was.
    const forMoney =
      reason === 'money' ||
      (reason === undefined &&
        state.contractYearsRemaining > 0 &&
        offer.wage > state.wage * 1.25 &&
        toStrength <= fromStrength + 2);
    if (forMoney || state.contractYearsRemaining > 0) {
      leaving.standing = clamp(leaving.standing - (forMoney ? 26 : 9), 1, 99);
    }
    leaving.leftForMoney = leaving.leftForMoney || forMoney;
  }

  state.parentClubId = offer.loan ? state.clubId : null;
  state.clubId = offer.clubId;
  state.contractYearsRemaining = offer.contractYears;
  state.wage = offer.wage;
  // A new manager starts you from scratch.
  state.condition.managerRelationship = clamp(state.condition.managerRelationship * 0.3, -100, 100);
  standingFor(state, offer.clubId);
  void world;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * What a scripted beat does when no decision card answers it.
 *
 * Beats fire on a guaranteed cadence whether or not content exists for them.
 * Phase 3 replaces most of these with real cards; until then these defaults
 * keep the guarantee honest — in particular the injury window, which is why
 * every career has at least one injury in it.
 */
function applyDefaultBeat(
  state: CareerState,
  world: World,
  beat: BeatId,
  modifiers: SeasonModifiers,
): void {
  switch (beat) {
    case 'injury-window':
      modifiers.forceInjury = true;
      break;
    case 'national-decision': {
      // Phase 3 turns this into a choice of allegiance. For now he declares for
      // the country he was born in.
      const home = world.nation(state.player.nationId);
      state.national.nationId = home.id;
      state.national.committed = true;
      break;
    }
    case 'first-contract':
    case 'first-derby':
    case 'transfer-window':
    case 'retirement':
      break;
  }
}

export function runCareer(config: CareerConfig, world: World, policy: CareerPolicy): Career {
  const state = createCareer(substream(config.seed, 'creation', 0), config, world);
  return continueCareer(state, world, policy, config);
}

/**
 * Runs a career on from an existing state. The balance suite branches from
 * snapshots taken mid-career, so the loop has to be able to start anywhere.
 */
export function continueCareer(
  initial: CareerState,
  world: World,
  policy: CareerPolicy,
  config: CareerConfig,
): Career {
  let state = initial;

  while (!state.retired) {
    // 1. Housekeeping, then the delayed queue. Effects that land this season are
    //    felt this season, so both run before anything else.
    expireModifiers(state);
    const rng = decisionRng(state.seed, state.season);
    const events = drainQueue(state, rng);
    state.player.ovr = computeOvr(state.player.attributes, state.player.position);

    // 2. The mechanical transfer window: contracts expiring, nobody wanting him.
    //    Card-driven moves are separate and happen at the decision below.
    if (state.season >= 1) {
      const ended = runTransferWindow(state, world, policy);
      if (ended) break;
    }

    // 3. A decision, if one is owed.
    const beats = dueBeats(state, world);
    const cadenceDue = state.season % CADENCE_INTERVAL[state.cadence] === 0;
    let answeredBeat: BeatId | null = null;
    if (beats.length > 0 || cadenceDue) {
      const selection = selectCard(state, world, beats, rng);
      const presented = present(selection.def, selection.ctx);
      answeredBeat = (selection.beat as BeatId | null) ?? null;

      const index = clamp(
        Math.trunc(
          policy.decide({
            season: state.season,
            year: state.year,
            age: state.player.age,
            card: presented,
            beat: answeredBeat,
            state,
          }),
        ),
        0,
        presented.options.length - 1,
      );
      const option = presented.options[index];
      if (!option) throw new Error(`Card ${presented.cardId} produced no options`);

      const outcome = applyDecision(state, presented.cardId, option.id, rng, world, presented.subject);
      state = outcome.state;
      events.push(...outcome.log);
      // A card can move an attribute, and OVR is derived from attributes.
      state.player.ovr = computeOvr(state.player.attributes, state.player.position);

      if (answeredBeat) state.firedBeats = markFired(state, answeredBeat);

      if (outcome.declaredNation) {
        state.national.nationId = outcome.declaredNation;
        state.national.committed = true;
      }
      if (outcome.transfer) {
        const offer = presented.subject.offers?.[outcome.transfer.offerIndex];
        if (offer) {
          completeMove(state, world, offer, outcome.transfer.reason);
          // The new club sets the wage, so a rise the card promised has to be
          // applied on top of the new deal rather than to the old one.
          if (outcome.wageMultiplier !== 1) {
            state.wage = Math.round(state.wage * outcome.wageMultiplier);
          }
        }
      }
      if (outcome.retire) {
        state.retired = true;
        state.endReason = 'retired';
        break;
      }
    }

    // Beats no card answered still fire — that is the whole point of them.
    const beatModifiers: SeasonModifiers = { minutesFactor: 1, trainingFactor: 1, injuryRiskFactor: 1 };
    for (const beat of beats) {
      if (beat === answeredBeat) continue;
      applyDefaultBeat(state, world, beat, beatModifiers);
      state.firedBeats = markFired(state, beat);
    }

    // 4. Fold the live modifiers into what the simulation reads.
    const active = resolveModifiers(state);
    const modifiers: SeasonModifiers = {
      minutesFactor: active.minutesFactor * beatModifiers.minutesFactor,
      trainingFactor: active.developmentFactor * beatModifiers.trainingFactor,
      injuryRiskFactor: active.injuryRiskFactor * beatModifiers.injuryRiskFactor,
      focus: active.focus.length > 0 ? (active.focus as AttributeKey[]) : undefined,
      forceInjury: beatModifiers.forceInjury,
      standingBonus: active.standingBonus,
    };

    // 5. Play the season.
    const outcome = simulateSeason(state, world, modifiers);
    const nationalRng = substream(state.seed, 'national', state.season);
    const international = simulateInternationalSeason(nationalRng, state, world, outcome.record);

    const record: SeasonRecord = {
      ...outcome.record,
      caps: international.caps,
      internationalGoals: international.goals,
      trophies: international.trophy
        ? [...outcome.record.trophies, international.trophy]
        : outcome.record.trophies,
    };

    commitSeason(state, world, record, outcome, international, events);

    // 6. The world moves on.
    const tableRng = substream(state.seed, 'leagueTables', state.season + 10_000);
    advanceWorld(tableRng, world, state.world, outcome.worldResult);

    state.season += 1;
    state.year += 1;
    state.player.age += 1;
    state.contractYearsRemaining = Math.max(0, state.contractYearsRemaining - 1);
    if (state.parentClubId && state.contractYearsRemaining <= 0) {
      // A loan ends and he goes back to his parent club.
      state.clubId = state.parentClubId;
      state.parentClubId = null;
      state.contractYearsRemaining = 2;
    }

    if (outcome.injuries.careerEnding && state.player.age >= MIN_CAREER_END_AGE) {
      state.retired = true;
      state.endReason = 'injury';
    } else if (state.player.age > MAX_AGE) {
      state.retired = true;
      state.endReason = 'forced-age';
    }
  }

  const ending = computeEnding(state, world);
  const finalAttributes = displayAttributes(state.player.attributes, state.player.ceiling);
  return {
    seed: state.seed,
    seedLabel: state.seedLabel,
    config,
    player: {
      ...state.player,
      attributes: finalAttributes,
      // Derived, always — so the headline number agrees with the numbers beside it.
      ovr: computeOvr(finalAttributes, state.player.position),
    },
    peakAge: state.player.peakAge,
    seasons: state.seasons,
    decisions: state.decisions,
    trophies: state.trophies,
    injuries: state.injuries,
    clubStandings: state.clubStandings,
    national: state.national,
    totals: computeTotals(state, world),
    peakOvr: state.peakOvr,
    peakMarketValue: state.peakMarketValue,
    endAge: state.player.age,
    endReason: state.endReason ?? 'forced-age',
    ending,
  };
}

/** Returns true when the window ended the career. */
function runTransferWindow(state: CareerState, world: World, policy: CareerPolicy): boolean {
  const rng = substream(state.seed, 'transfers', state.season);
  const last = state.seasons[state.seasons.length - 1];
  const recentOutput = recentOutputShare(last, state.player.position);

  const outOfContract = state.contractYearsRemaining <= 0;
  const renewal = outOfContract ? renewalOffer(rng, state, world) : null;
  const mustMove = outOfContract && renewal === null;

  const offers = generateOffers(rng, { state, world, recentOutput, mustMove });
  const wantsLoan =
    state.player.age <= 22 && (last ? last.minutes < 1100 : true) && !state.parentClubId;
  const loans = wantsLoan ? generateLoanOffers(rng, { state, world, recentOutput, mustMove }) : [];
  const all = [...offers, ...loans];

  if (mustMove && all.length === 0) {
    if (state.player.age < MIN_CAREER_END_AGE) {
      // Too young to be finished. A club that has had him since he was a boy
      // gives him another year rather than releasing him at eighteen.
      state.contractYearsRemaining = 1;
      state.wage = Math.round(state.wage * 0.9);
      return false;
    }
    // Nobody wants him and his club has let him go. This is how most careers
    // actually end: not a decision, just no offers.
    state.retired = true;
    state.endReason = 'attrition';
    return true;
  }

  const choice = policy.transfer({
    season: state.season,
    year: state.year,
    age: state.player.age,
    state,
    offers: all,
    renewal,
    mustMove,
  });

  const picked = choice >= 0 ? all[choice] : undefined;
  if (picked) {
    completeMove(state, world, picked);
  } else if (renewal) {
    state.contractYearsRemaining = renewal.contractYears;
    state.wage = renewal.wage;
    const standing = standingFor(state, state.clubId);
    standing.standing = clamp(standing.standing + 4, 1, 99);
  } else if (outOfContract && all.length > 0) {
    // He had to move and the policy declined. He goes anyway.
    completeMove(state, world, all[0] as TransferOffer);
  }
  return false;
}

function commitSeason(
  state: CareerState,
  world: World,
  record: SeasonRecord,
  outcome: ReturnType<typeof simulateSeason>,
  international: ReturnType<typeof simulateInternationalSeason>,
  events: string[],
): void {
  const league = world.league(clubLeagueId(state.world, state.clubId));
  const club = world.club(state.clubId);

  state.player.attributes = outcome.development.attributes;
  state.player.ceiling = outcome.development.ceiling;
  state.player.ovr = computeOvr(state.player.attributes, state.player.position);

  // Reputation: what you did, where anyone could see it.
  const visibility = 0.5 + (league.prestige / 100) * 0.6 + league.strength * 0.3;
  const output = record.goals * 0.4 + record.assists * 0.22 + (record.keeper?.cleanSheets ?? 0) * 0.22;
  const trophyBump = record.trophies.reduce((sum, t) => sum + world.competition(t.competitionId).prestige / 20, 0);
  // Playing week in week out in a league people watch makes you famous whether
  // or not you score. Without this term a defender stays anonymous for a whole
  // career and never gets near a national squad.
  const exposure = (record.minutes / 3000) * (1.4 + (league.prestige / 100) * 3.1);
  const gained = (output * visibility + trophyBump + exposure) * 0.95 + international.reputationDelta;
  state.player.reputation = clamp(state.player.reputation + gained - state.player.reputation * 0.07, 1, 99);

  state.national.standing = international.calledUp
    ? international.standing
    : clamp(state.national.standing - 5, 0, 100);
  state.national.caps += record.caps;
  state.national.goals += record.internationalGoals;
  if (international.tournamentPlayed) state.national.tournamentsPlayed += 1;
  if (international.trophy) {
    state.national.tournamentsWon += 1;
    state.national.bestFinish = 'winners';
  } else if (international.finish && state.national.bestFinish !== 'winners') {
    state.national.bestFinish = international.finish;
  }

  record.marketValue = computeMarketValue({
    ovr: state.player.ovr,
    age: state.player.age + 1,
    reputation: state.player.reputation,
    leaguePrestige: league.prestige,
    leagueStrength: league.strength,
    contractYearsRemaining: Math.max(0, state.contractYearsRemaining - 1),
    recentOutput: recentOutputShare(record, state.player.position),
  });
  state.player.marketValue = record.marketValue;
  // Wage is set by the contract, not recomputed every summer. Recomputing it
  // here wiped every rise a card or a negotiation had won, which made wage
  // effects last exactly one season and the money cards meaningless.
  void club;

  // Condition carries forward. Wear never fully comes off.
  state.condition.wear = clamp(
    state.condition.wear + (record.minutes / 3000) * 4.2 + outcome.injuries.wearAdded - 1.4,
    0,
    100,
  );
  if (outcome.injuries.injuries.some((i) => i.matchesMissed >= 8)) {
    state.condition.injuryProneness = clamp(state.condition.injuryProneness + 3, 1, 99);
  }
  // A knock late in a season is still felt at the start of the next one.
  state.suppression = Math.round(outcome.injuries.suppression * 0.25);

  const formTarget = record.averageRating > 0 ? (record.averageRating - 6.6) * 15 : -5;
  state.condition.form = clamp(state.condition.form * 0.3 + formTarget * 0.7, -20, 20);

  // The manager's view of him moves with performance, and collapses if he has
  // been frozen out.
  const managerShift =
    (record.averageRating > 0 ? (record.averageRating - 6.55) * 22 : -12) +
    (outcome.minutes.swing === 'frozen-out' ? -25 : 0) +
    (outcome.minutes.swing === 'opportunity' ? 6 : 0);
  state.condition.managerRelationship = clamp(
    state.condition.managerRelationship * 0.55 + managerShift,
    -100,
    100,
  );

  const standing = standingFor(state, state.clubId);
  standing.seasonsServed += 1;
  standing.appearances += record.appearances;
  standing.goals += record.goals;
  standing.assists += record.assists;
  standing.trophiesWon += record.trophies.filter((t) => t.clubId !== null).length;
  const served = Math.min(standing.seasonsServed, 12);
  const performance = record.averageRating > 0 ? (record.averageRating - 6.5) * 9 : -3;
  standing.standing = clamp(
    standing.standing + served * 1.3 + performance + record.trophies.filter((t) => t.clubId !== null).length * 6,
    1,
    99,
  );

  record.events = events;
  state.trophies.push(...record.trophies);
  state.injuries.push(...record.injuries);
  state.seasons.push(record);
  state.barrenSeasons = record.minutes < 450 ? state.barrenSeasons + 1 : 0;
  state.peakOvr = Math.max(state.peakOvr, state.player.ovr);
  state.peakMarketValue = Math.max(state.peakMarketValue, state.player.marketValue);
}

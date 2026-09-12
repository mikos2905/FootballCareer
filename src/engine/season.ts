import { developAttributes, FULL_SEASON_MINUTES, type DevelopmentResult } from './development';
import { position } from './positions';
import { computeMarketValue, computeOvr, computeWage } from './ratings';
import { clamp, Rng } from './rng';
import type { AttributeKey, CareerState, SeasonRecord, TrophyWin } from './types';
import type { World } from './world';

/**
 * One season of football.
 *
 * Nothing here is a coin flip. Every uncertain quantity is an expectation
 * computed from state — attributes, club, league, minutes, form — with a
 * bounded draw around it.
 *
 * NOTE (phase 2): constants are plausible but untuned. The CLI harness fits
 * them against the distribution targets before any UI exists.
 */

export interface SeasonModifiers {
  minutesFactor: number;
  developmentFactor: number;
  focus?: readonly AttributeKey[];
  /** Set by a "play through it" decision — more minutes now, more wear later. */
  extraWear?: number;
}

export const NEUTRAL_MODIFIERS: SeasonModifiers = { minutesFactor: 1, developmentFactor: 1 };

/** Rough squad quality a club of this strength fields. */
export function squadOvr(clubStrength: number): number {
  return 32 + clubStrength * 0.55;
}

/** Young players do not walk into a first team, and old ones drop out of it. */
function ageMinutesAllowance(age: number): number {
  if (age <= 16) return -13;
  if (age <= 21) return -13 + (age - 16) * 2.4;
  if (age <= 32) return 0;
  return -(age - 32) * 1.6;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface SeasonOutcome {
  record: SeasonRecord;
  development: DevelopmentResult;
  poor: boolean;
}

export function simulateSeason(
  rng: Rng,
  state: CareerState,
  world: World,
  modifiers: SeasonModifiers = NEUTRAL_MODIFIERS,
): SeasonOutcome {
  const club = world.club(state.clubId);
  const league = world.league(club.leagueId);
  const pos = position(state.player.position);
  const { player, condition } = state;

  // -- Injuries -------------------------------------------------------------
  const injuryExpectation =
    (condition.injuryProneness / 100) * 5.5 +
    (condition.wear / 100) * 4.5 +
    Math.max(0, player.age - 30) * 0.55;
  const injuryWeeks = Math.round(
    rng.aroundSkewed(injuryExpectation, Math.max(2.2, injuryExpectation * 0.85), 38),
  );
  const availability = clamp(1 - injuryWeeks / 40, 0.08, 1);

  // -- Minutes --------------------------------------------------------------
  const quality = player.ovr - squadOvr(club.strength) + ageMinutesAllowance(player.age);
  // A run of bad seasons is capped: after two, the floor under minutes rises so
  // the career stays alive long enough to be turned around.
  const streakRelief = state.poorSeasonStreak >= 2 ? 2.5 : 0;
  const share = sigmoid((quality + streakRelief) / 5.5);
  const minutesLuck = rng.around(1, 0.13, 0.66, 1.34);
  const minutes = Math.round(
    clamp(FULL_SEASON_MINUTES * share * modifiers.minutesFactor * minutesLuck * availability, 0, FULL_SEASON_MINUTES * 1.08),
  );
  const appearances = Math.round(clamp(minutes / 74, 0, 46));

  // -- Output ---------------------------------------------------------------
  const formFactor = 1 + condition.form / 110;
  const leagueSuppression = 1 - (league.strength - 70) / 100 * 0.75;
  const teamAttack = 1 + ((club.strength - 70) / 100) * pos.teamAttackSensitivity * 1.6;

  const finishing = Math.pow(player.attributes[pos.scoringDriver] / 70, 1.6);
  const creating = Math.pow(
    (player.attributes.passing * 0.6 + player.attributes.flair * 0.25 + player.attributes.dribbling * 0.15) / 70,
    1.5,
  );

  const goalsExpected =
    pos.goalRate * finishing * teamAttack * leagueSuppression * formFactor * (minutes / 90);
  const assistsExpected =
    pos.assistRate * creating * teamAttack * leagueSuppression * formFactor * (minutes / 90);

  // Spread and the upper cap both scale with how much football was actually
  // played, so a season of no minutes cannot produce goals, and a 40-goal
  // season is out of reach for a player whose expectation is nowhere near it.
  const playedShare = clamp(minutes / FULL_SEASON_MINUTES, 0, 1.1);
  const goals = Math.round(
    rng.aroundSkewed(
      goalsExpected,
      Math.sqrt(Math.max(goalsExpected, 0.25)) * 1.15 + 0.8 * playedShare,
      goalsExpected * 2.1 + 3 * playedShare,
    ),
  );
  const assists = Math.round(
    rng.aroundSkewed(
      assistsExpected,
      Math.sqrt(Math.max(assistsExpected, 0.25)) * 1.05 + 0.7 * playedShare,
      assistsExpected * 2.2 + 3 * playedShare,
    ),
  );

  // -- Rating ---------------------------------------------------------------
  const contributionPer90 = minutes > 0 ? ((goals + assists * 0.7) / minutes) * 90 : 0;
  const baselineContribution = pos.goalRate + pos.assistRate * 0.7;
  const ratingBase =
    6.45 +
    (contributionPer90 - baselineContribution) * 1.5 +
    (player.ovr - squadOvr(club.strength)) * 0.035 +
    condition.form * 0.012;
  const averageRating = minutes < 200
    ? 0
    : Math.round(clamp(rng.around(ratingBase, 0.22, 5.1, 9.2), 5.1, 9.2) * 100) / 100;

  // -- League position and trophies -----------------------------------------
  const leagueClubs = world.clubsInLeague(league.id);
  const baseRank = Math.max(1, leagueClubs.findIndex((c) => c.id === club.id) + 1);
  const playerLift = clamp((player.ovr - squadOvr(club.strength)) / 7, -1.5, 2.5) * (minutes / FULL_SEASON_MINUTES);
  const leaguePosition = Math.round(
    clamp(rng.around(baseRank - playerLift, 2.9, 1, leagueClubs.length), 1, leagueClubs.length),
  );

  const trophies: TrophyWin[] = [];
  const award = (competitionId: string) => {
    const comp = world.competition(competitionId);
    trophies.push({
      competitionId: comp.id,
      competitionName: comp.name,
      season: state.season,
      year: state.year,
      clubId: club.id,
      clubName: club.name,
    });
  };

  // A trophy only counts if the player was actually part of the season.
  const involved = minutes >= 600;

  if (leaguePosition === 1 && involved) award(league.id);

  const strengthCube = Math.pow(club.strength / 100, 3);
  const leagueCube = leagueClubs.reduce((sum, c) => sum + Math.pow(c.strength / 100, 3), 0);
  const domesticShare = leagueCube > 0 ? strengthCube / leagueCube : 0;
  const tierShare = league.tier === 1 ? clamp(league.strength / 95, 0.3, 1) : 0.22;
  for (const cupId of league.domesticCups) {
    const cup = world.competition(cupId);
    // Super-cup style one-off matches are contested by last season's winners, so
    // they track league standing rather than a full knockout run.
    const isSuperCup = cup.prestige <= 46;
    const p = isSuperCup
      ? (leaguePosition <= 2 ? 0.42 : 0.05) * domesticShare * 6
      : domesticShare * tierShare * 0.85;
    if (involved && rng.chance(clamp(p, 0, 0.75))) award(cupId);
  }

  if (league.continental === 'elite' && involved) {
    const qualified = leaguePosition <= (league.strength >= 80 ? 4 : 2);
    const secondary = !qualified && leaguePosition <= (league.strength >= 80 ? 7 : 5);
    if (qualified) {
      const cup = world.continentalCup(league.confederation, 'elite');
      const p = Math.pow(clamp((club.strength - 66) / 32, 0, 1), 2.6) * 0.38;
      if (cup && rng.chance(p)) award(cup.id);
    } else if (secondary) {
      const cup = world.continentalCup(league.confederation, 'secondary');
      const p = Math.pow(clamp((club.strength - 58) / 36, 0, 1), 2.1) * 0.3;
      if (cup && rng.chance(p)) award(cup.id);
    }
  }

  // -- Development ----------------------------------------------------------
  const development = developAttributes(rng, player.attributes, player.ceiling, player.position, {
    age: player.age,
    minutes,
    leagueStrength: league.strength,
    injuryWeeks,
    wear: condition.wear,
    developmentFactor: modifiers.developmentFactor,
    focus: modifiers.focus,
  });

  const nextOvr = computeOvr(development.attributes, player.position);

  const record: SeasonRecord = {
    season: state.season,
    year: state.year,
    age: player.age,
    clubId: club.id,
    clubName: club.name,
    leagueId: league.id,
    leagueName: league.name,
    onLoanFrom: state.parentClubId,
    appearances,
    minutes,
    goals,
    assists,
    averageRating,
    leaguePosition,
    ovrStart: player.ovr,
    ovrEnd: nextOvr,
    marketValue: computeMarketValue({
      ovr: nextOvr,
      age: player.age + 1,
      reputation: player.reputation,
      leaguePrestige: league.prestige,
      clubPrestige: club.prestige,
      contractYearsRemaining: Math.max(0, state.contractYearsRemaining - 1),
    }),
    injuryWeeks,
    caps: 0,
    internationalGoals: 0,
    trophies,
  };

  const poor = minutes < 900 || (averageRating > 0 && averageRating < 6.35);
  return { record, development, poor };
}

/** Wage the current club would pay after this season's numbers. */
export function refreshedWage(state: CareerState, world: World, ovr: number): number {
  const club = world.club(state.clubId);
  return computeWage({
    ovr,
    wageBudget: club.wageBudget,
    reputation: state.player.reputation,
    age: state.player.age,
  });
}

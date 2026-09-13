import { developAttributes, type DevelopmentResult } from './development';
import { simulateInjuries, type InjurySeasonResult } from './injuries';
import {
  clubLeagueId,
  clubStrength,
  clubsInLeague,
  knockoutRounds,
  leagueAverageStrength,
  runKnockout,
  simulateWorldSeason,
  type SeasonWorldResult,
} from './league';
import { simulateMinutes, totalMatchesFor, type MinutesResult } from './minutes';
import { simulateKeeper, simulateOutput, type KeeperResult, type OutputResult } from './output';
import { position } from './positions';
import { computeOvr } from './ratings';
import { clamp, substream, type Rng } from './rng';
import type { AttributeKey, CareerState, SeasonRecord, TrophyWin } from './types';
import type { World } from './world';

/**
 * One season of football, assembled from the subsystem models.
 *
 * Order matters and is fixed: injuries decide availability, availability
 * decides minutes, minutes decide output and development, output nudges the
 * club's league finish, and the finish decides the trophies.
 */

export interface SeasonModifiers {
  minutesFactor: number;
  trainingFactor: number;
  injuryRiskFactor: number;
  focus?: readonly AttributeKey[];
  /** Set by the scripted injury window. Fires regardless of the hazard roll. */
  forceInjury?: boolean;
  /** Points added to squad standing by live modifiers — a captaincy, say. */
  standingBonus?: number;
}

export const NEUTRAL_MODIFIERS: SeasonModifiers = {
  minutesFactor: 1,
  trainingFactor: 1,
  injuryRiskFactor: 1,
};

export interface SeasonOutcome {
  record: SeasonRecord;
  development: DevelopmentResult;
  minutes: MinutesResult;
  injuries: InjurySeasonResult;
  output: OutputResult | null;
  keeper: KeeperResult | null;
  worldResult: SeasonWorldResult;
}

export function simulateSeason(
  state: CareerState,
  world: World,
  modifiers: SeasonModifiers,
): SeasonOutcome {
  const season = state.season;
  const seed = state.seed;
  const club = world.club(state.clubId);
  const leagueId = clubLeagueId(state.world, state.clubId);
  const league = world.league(leagueId);
  const pos = position(state.player.position);
  const { player } = state;

  const strength = clubStrength(state.world, state.clubId);
  const leagueAverage = leagueAverageStrength(world, state.world, leagueId);

  // Continental involvement is decided by last season's finish.
  const lastPosition = state.world.clubs[state.clubId]?.lastPosition ?? 0;
  const inContinental =
    league.continental === 'elite' && lastPosition > 0 && lastPosition <= (league.strength >= 0.85 ? 6 : 3);
  const totalMatches = totalMatchesFor(inContinental, league.domesticCups.length);

  // -- Injuries -------------------------------------------------------------
  const injuryRng = substream(seed, 'injuries', season);
  const intendedShareGuess = clamp(
    (player.ovr - (30 + strength * 0.58)) / 18 + 0.5,
    0.05,
    1,
  );
  const injuries = simulateInjuries(
    injuryRng,
    {
      attributes: player.attributes,
      position: player.position,
      age: player.age,
      injuryProneness: state.condition.injuryProneness,
      wear: state.condition.wear,
      totalMatches,
      intendedShare: intendedShareGuess,
      riskFactor: modifiers.injuryRiskFactor,
    },
    season,
    modifiers.forceInjury === true,
  );

  // -- Minutes --------------------------------------------------------------
  const matchRng = substream(seed, 'matches', season);
  const suppression = Math.max(state.suppression, injuries.suppression);
  const minutes = simulateMinutes(matchRng, {
    attributes: player.attributes,
    position: player.position,
    age: player.age,
    squadStrength: strength,
    managerRelationship: state.condition.managerRelationship,
    form: state.condition.form,
    suppression,
    matchesMissed: injuries.matchesMissed,
    totalMatches,
    minutesFactor: modifiers.minutesFactor,
    standingBonus: modifiers.standingBonus ?? 0,
  });

  // -- Output ---------------------------------------------------------------
  const suppressed = { ...player.attributes };
  for (const key of Object.keys(suppressed) as AttributeKey[]) {
    suppressed[key] = clamp(suppressed[key] - suppression, 1, 99);
  }

  const isKeeper = player.position === 'GK';
  let output: OutputResult | null = null;
  let keeper: KeeperResult | null = null;
  let averageRating = 0;
  let contribution = 0;

  if (isKeeper) {
    keeper = simulateKeeper(matchRng, {
      attributes: suppressed,
      minutes: minutes.minutes,
      starts: minutes.starts,
      clubStrength: strength,
      leagueAverageStrength: leagueAverage,
      leagueStrength: league.strength,
      form: state.condition.form,
      ovr: player.ovr,
    });
    averageRating = keeper.averageRating;
    contribution = keeper.contributionIndex;
  } else {
    output = simulateOutput(matchRng, {
      attributes: suppressed,
      position: player.position,
      minutes: minutes.minutes,
      clubStrength: strength,
      leagueAverageStrength: leagueAverage,
      leagueStrength: league.strength,
      form: state.condition.form,
      ovr: player.ovr,
    });
    averageRating = output.averageRating;
    contribution = output.contributionIndex;
  }

  // -- The club's season ----------------------------------------------------
  const tableRng = substream(seed, 'leagueTables', season);
  // Modest: enough that a great individual season tips a close title race,
  // never enough to carry a weak squad to one.
  const minutesShare = clamp(minutes.minutes / (totalMatches * 90), 0, 1);
  // Trimmed for phase 3: decision cards hand out minutes bonuses, which raise
  // contribution, which was quietly promoting players' clubs a division and
  // pushing big-five football from a minority experience to a common one.
  const nudgePoints = clamp(contribution * 2.2, -1.2, 3) * minutesShare;
  const worldResult = simulateWorldSeason(tableRng, world, state.world, {
    clubId: state.clubId,
    points: nudgePoints,
  });
  const leaguePosition = worldResult.tables[leagueId]?.position[state.clubId] ?? 0;

  // -- Trophies -------------------------------------------------------------
  const trophies: TrophyWin[] = [];
  const award = (competitionId: string) => {
    const comp = world.competition(competitionId);
    trophies.push({
      competitionId: comp.id,
      competitionName: comp.name,
      season,
      year: state.year,
      clubId: club.id,
      clubName: club.name,
    });
  };
  // A medal only counts if he was actually part of the season.
  const involved = minutes.minutes >= 600;

  if (involved && leaguePosition === 1) award(leagueId);

  const divisionStrengths = clubsInLeague(world, state.world, leagueId).map((c) =>
    clubStrength(state.world, c.id),
  );
  for (const cupId of league.domesticCups) {
    const cup = world.competition(cupId);
    if (cup.prestige <= 46) {
      // A one-off super cup, contested by last season's champions.
      if (involved && lastPosition === 1 && tableRng.chance(0.45)) award(cupId);
      continue;
    }
    const field = league.tier === 1 ? divisionStrengths.length * 4 : divisionStrengths.length * 2;
    if (involved && runKnockout(tableRng, strength, divisionStrengths, knockoutRounds(field))) {
      award(cupId);
    }
  }

  if (involved && inContinental) {
    const cup = world.continentalCup(league.confederation, 'elite');
    if (cup) {
      const field = continentalField(world, state, league.confederation);
      if (runKnockout(tableRng, strength, field, knockoutRounds(32))) award(cup.id);
    }
  } else if (involved && league.continental === 'elite' && lastPosition > 0 && lastPosition <= 7) {
    const cup = world.continentalCup(league.confederation, 'secondary');
    if (cup) {
      const field = continentalField(world, state, league.confederation);
      if (runKnockout(tableRng, strength, field.map((s) => s - 8), knockoutRounds(32))) award(cup.id);
    }
  }

  // -- Development ----------------------------------------------------------
  const devRng = substream(seed, 'development', season);
  const development = developAttributes(devRng, player.attributes, player.ceiling, player.position, {
    age: player.age,
    peakAge: player.peakAge,
    minutes: minutes.minutes,
    leagueStrength: league.strength,
    matchesMissed: injuries.matchesMissed,
    wear: state.condition.wear,
    trainingFactor: modifiers.trainingFactor,
    focus: modifiers.focus,
    permanent: injuries.permanent,
  });

  const record: SeasonRecord = {
    season,
    year: state.year,
    age: player.age,
    clubId: club.id,
    clubName: club.name,
    leagueId,
    leagueName: league.name,
    leagueTier: league.tier,
    onLoanFrom: state.parentClubId,
    squadRole: minutes.role,
    starts: minutes.starts,
    substituteAppearances: minutes.substituteAppearances,
    appearances: minutes.appearances,
    minutes: minutes.minutes,
    goals: output?.goals ?? 0,
    assists: output?.assists ?? 0,
    averageRating,
    leaguePosition,
    ovrStart: player.ovr,
    ovrEnd: computeOvr(development.attributes, player.position),
    marketValue: 0,
    wage: state.wage,
    injuries: injuries.injuries,
    matchesMissed: injuries.matchesMissed,
    caps: 0,
    internationalGoals: 0,
    keeper: keeper ? keeper.keeper : null,
    trophies,
    events: [],
  };

  // Position baselines are what "recent output" is measured against.
  void pos;

  return { record, development, minutes, injuries, output, keeper, worldResult };
}

function continentalField(world: World, state: CareerState, confederation: string): number[] {
  const out: number[] = [];
  for (const league of world.data.leagues) {
    if (league.confederation !== confederation || league.continental !== 'elite') continue;
    const clubs = clubsInLeague(world, state.world, league.id);
    for (const club of clubs.slice(0, league.strength >= 0.85 ? 5 : 2)) {
      out.push(clubStrength(state.world, club.id));
    }
  }
  return out.length > 0 ? out : [70];
}

/** Recent output as a share of the position baseline, for market value. */
export function recentOutputShare(record: SeasonRecord | undefined, positionId: CareerState['player']['position']): number {
  if (!record || record.minutes < 450) return 0.6;
  const pos = position(positionId);
  const baseline = pos.goalsPer90 + pos.assistsPer90 * 0.7;
  if (baseline <= 0) {
    // Goalkeepers are judged on clean sheets instead.
    const starts = Math.max(1, record.starts);
    return clamp(((record.keeper?.cleanSheets ?? 0) / starts) / 0.32, 0.3, 2);
  }
  const actual = ((record.goals + record.assists * 0.7) / record.minutes) * 90;
  return clamp(actual / baseline, 0.2, 2.4);
}

export type { Rng };

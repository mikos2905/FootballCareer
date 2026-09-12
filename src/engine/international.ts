import { clamp, Rng } from './rng';
import type { CareerState, SeasonRecord, TrophyWin } from './types';
import type { World } from './world';

/**
 * National-team football. A call-up is earned through reputation measured
 * against how strong the nation is — breaking into Argentina is not the same
 * job as breaking into Scotland.
 */

export function callUpThreshold(nationStrength: number): number {
  return 18 + nationStrength * 0.42;
}

export function isEligibleFor(world: World, homeNationId: string, nationId: string): boolean {
  if (homeNationId === nationId) return true;
  const home = world.nation(homeNationId);
  return (home.alternativeNationIds ?? []).includes(nationId);
}

/** Nations the player may declare for, home nation first. Stable order. */
export function eligibleNations(world: World, homeNationId: string): string[] {
  const home = world.nation(homeNationId);
  return [homeNationId, ...(home.alternativeNationIds ?? [])];
}

/** The major tournament, if any, played in this calendar year. */
export function tournamentForYear(world: World, confederation: string, year: number): string | null {
  if ((year - 2026) % 4 === 0) return 'int.world';
  if ((year - 2024) % 4 === 0) {
    const comp = world.continentalNations(confederation);
    return comp ? comp.id : null;
  }
  return null;
}

export interface InternationalOutcome {
  caps: number;
  goals: number;
  standingDelta: number;
  reputationDelta: number;
  tournamentPlayed: boolean;
  trophy: TrophyWin | null;
}

export function simulateInternationalSeason(
  rng: Rng,
  state: CareerState,
  world: World,
  seasonRecord: SeasonRecord,
): InternationalOutcome {
  const none: InternationalOutcome = {
    caps: 0,
    goals: 0,
    standingDelta: -2,
    reputationDelta: 0,
    tournamentPlayed: false,
    trophy: null,
  };

  const { national, player } = state;
  if (!national.committed || !national.nationId) return none;

  const nation = world.nation(national.nationId);
  const threshold = callUpThreshold(nation.strength);
  if (player.reputation < threshold) return { ...none, standingDelta: -4 };

  const club = world.club(state.clubId);
  const league = world.league(club.leagueId);

  // How firmly in the squad: reputation over the bar, form, and whether anyone
  // is watching the league you play in.
  const margin = player.reputation - threshold;
  const visibility = 0.7 + (league.prestige / 100) * 0.5;
  const standingTarget = clamp(margin * 2.6 * visibility, 0, 100);
  const standingDelta = clamp((standingTarget - national.standing) * 0.45, -12, 18);
  const standing = clamp(national.standing + standingDelta, 0, 100);

  const tournamentId = tournamentForYear(world, nation.confederation, state.year);
  const baseCaps = 4 + (standing / 100) * 6 + (tournamentId ? 3 : 0);
  const availability = clamp(1 - seasonRecord.injuryWeeks / 40, 0.1, 1);
  const caps = Math.round(clamp(rng.around(baseCaps * availability, 1.8, 0, 16), 0, 16));

  const clubGoalsPer90 = seasonRecord.minutes > 0 ? (seasonRecord.goals / seasonRecord.minutes) * 90 : 0;
  const goalsExpected = clubGoalsPer90 * caps * 0.78;
  const goals = Math.round(rng.aroundSkewed(goalsExpected, Math.sqrt(Math.max(goalsExpected, 0.4)) + 0.5, goalsExpected * 2.3 + 2));

  let trophy: TrophyWin | null = null;
  let tournamentPlayed = false;
  if (tournamentId && caps >= 3) {
    tournamentPlayed = true;
    const comp = world.competition(tournamentId);
    const contribution = clamp((player.ovr - 70) / 40, -0.2, 0.35);
    const p = clamp(Math.pow(clamp((nation.strength - 55) / 45, 0, 1), 2.4) * 0.3 * (1 + contribution), 0, 0.45);
    if (rng.chance(p)) {
      trophy = {
        competitionId: comp.id,
        competitionName: comp.name,
        season: state.season,
        year: state.year,
        clubId: null,
        clubName: nation.name,
      };
    }
  }

  const reputationDelta =
    (caps / 10) * 2.2 + goals * 0.55 + (trophy ? 7 : 0) + (tournamentPlayed ? 1.5 : 0);

  return { caps, goals, standingDelta: standing - national.standing, reputationDelta, tournamentPlayed, trophy };
}

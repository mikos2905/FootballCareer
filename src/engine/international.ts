import { clubLeagueId } from './league';
import { position } from './positions';
import { clamp, overdispersed, Rng } from './rng';
import type { CareerState, League, SeasonRecord, TrophyWin } from './types';
import type { World } from './world';

/**
 * National-team football.
 *
 * A call-up is judged on OVR adjusted for how visible the player's league is,
 * measured against how strong the nation is. Being excellent in a league nobody
 * watches genuinely costs caps — which is what gives the lucrative move to a
 * weak league its sting.
 */

/** 12 (an invisible third tier) to about 26 (the strongest, most watched league). */
export function leagueVisibility(league: League): number {
  return (league.prestige / 100) * 16 + league.strength * 10;
}

/** Breaking into Argentina is not the same job as breaking into Scotland. */
export function callUpThreshold(nationStrength: number): number {
  return 52 + nationStrength * 0.28;
}

export function selectionScore(ovr: number, league: League): number {
  return ovr + (leagueVisibility(league) - 20);
}

export function isEligibleFor(world: World, homeNationId: string, nationId: string): boolean {
  if (homeNationId === nationId) return true;
  return (world.nation(homeNationId).alternativeNationIds ?? []).includes(nationId);
}

export function eligibleNations(world: World, homeNationId: string): string[] {
  return [homeNationId, ...(world.nation(homeNationId).alternativeNationIds ?? [])];
}

/** The major tournament, if any, in this calendar year. Two-year alternating cycle. */
export function tournamentForYear(world: World, confederation: string, year: number): string | null {
  if ((year - 2026) % 4 === 0) return 'int.world';
  if ((year - 2024) % 4 === 0) {
    const comp = world.continentalNations(confederation);
    return comp ? comp.id : null;
  }
  return null;
}

const FINISHES = ['group stage', 'last 16', 'quarter-final', 'semi-final', 'final'] as const;

export interface InternationalOutcome {
  caps: number;
  goals: number;
  standing: number;
  reputationDelta: number;
  tournamentPlayed: boolean;
  finish: string | null;
  trophy: TrophyWin | null;
  calledUp: boolean;
}

export function simulateInternationalSeason(
  rng: Rng,
  state: CareerState,
  world: World,
  seasonRecord: SeasonRecord,
): InternationalOutcome {
  const idle: InternationalOutcome = {
    caps: 0,
    goals: 0,
    standing: clamp(state.national.standing - 5, 0, 100),
    reputationDelta: 0,
    tournamentPlayed: false,
    finish: null,
    trophy: null,
    calledUp: false,
  };

  const { national, player } = state;
  if (!national.committed || !national.nationId) return { ...idle, standing: 0 };

  const nation = world.nation(national.nationId);
  const league = world.league(clubLeagueId(state.world, state.clubId));
  const score = selectionScore(player.ovr, league);
  const threshold = callUpThreshold(nation.strength);

  // Standing in the squad is its own currency, not just a multiplier once you
  // are in it. A player who has been a fixture for years keeps getting picked
  // through a dip in club form; one who pulled out of a tournament finds the
  // manager has moved on, whatever his rating says. Without this the whole
  // international side of the game was decided by OVR alone, and every card
  // that traded on the manager's goodwill was spending a currency nothing read.
  const standingEdge = ((national.standing - 45) / 100) * 20;

  // Being in the squad at all depends on playing club football.
  if (score + standingEdge < threshold || seasonRecord.minutes < 900) return idle;

  const margin = score - threshold;
  const target = clamp(35 + margin * 4.5, 0, 100);
  // Slower convergence than performance alone would give: a reputation with an
  // international manager is built and lost over seasons, not in one.
  const standing = clamp(national.standing + (target - national.standing) * 0.28, 0, 100);

  const tournamentId = tournamentForYear(world, nation.confederation, state.year);
  const baseCaps = 3.5 + (standing / 100) * 6.5 + (tournamentId ? 3 : 0);
  const availability = clamp(1 - seasonRecord.matchesMissed / 46, 0.1, 1);
  const caps = Math.round(clamp(rng.around(baseCaps * availability, 1.7, 0, 16), 0, 16));

  const pos = position(player.position);
  const clubPer90 = seasonRecord.minutes > 0 ? (seasonRecord.goals / seasonRecord.minutes) * 90 : pos.goalsPer90;
  // International football is harder than almost any club football.
  const goals = overdispersed(rng, clubPer90 * caps * 0.72, 2.1);

  let trophy: TrophyWin | null = null;
  let finish: string | null = null;
  let tournamentPlayed = false;

  if (tournamentId && caps >= 3) {
    tournamentPlayed = true;
    const comp = world.competition(tournamentId);
    const contribution = clamp((player.ovr - 72) / 45, -0.15, 0.3);
    const quality = clamp((nation.strength - 50) / 48, 0, 1);
    const reach = clamp(rng.around(quality * 4.2 * (1 + contribution), 1.1, 0, 5.4), 0, 5.4);
    const stage = Math.min(FINISHES.length - 1, Math.floor(reach));
    finish = reach >= 5 ? 'winners' : (FINISHES[stage] ?? 'group stage');
    if (reach >= 5) {
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
    (caps / 10) * 2.4 + goals * 0.6 + (trophy ? 8 : 0) + (tournamentPlayed ? 1.8 : 0);

  return { caps, goals, standing, reputationDelta, tournamentPlayed, finish, trophy, calledUp: true };
}

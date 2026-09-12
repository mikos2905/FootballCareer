import { realisation } from './development';
import { ceilingOvr } from './ratings';
import { clamp } from './rng';
import type { CareerState } from './types';
import type { World } from './world';

/**
 * Two win conditions, deliberately in tension.
 *
 * The stats path maximises OVR, goals, trophies, value and international
 * honours. The idol path retires at one club with standing maxed, having spent
 * most of a career there. The money and the trophies are almost never at the
 * club that would build you a statue.
 *
 * NOTE (phase 5): thresholds here are first-pass. The 2%-40% per-tier
 * distribution target gets fitted once the full card set exists.
 */

export type EndingTier =
  | 'statue'
  | 'global-superstar'
  | 'serial-winner'
  | 'cult-hero'
  | 'journeyman'
  | 'what-might-have-been';

export interface CareerTotals {
  seasons: number;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  trophyCount: number;
  trophyWeight: number;
  caps: number;
  internationalGoals: number;
  clubsPlayedFor: number;
}

export interface Ending {
  tier: EndingTier;
  label: string;
  verdict: string;
  careerScore: number;
  statsScore: number;
  idolScore: number;
  realisation: number;
  ceilingOvr: number;
  /** Club the statue would stand outside, if one is earned. */
  homeClubId: string | null;
}

export const TIER_LABELS: Record<EndingTier, string> = {
  statue: 'Statue',
  'global-superstar': 'Global Superstar',
  'serial-winner': 'Serial Winner',
  'cult-hero': 'Cult Hero',
  journeyman: 'Journeyman',
  'what-might-have-been': 'What Might Have Been',
};

export function computeTotals(state: CareerState, world: World): CareerTotals {
  const totals: CareerTotals = {
    seasons: state.seasons.length,
    appearances: 0,
    goals: 0,
    assists: 0,
    minutes: 0,
    trophyCount: state.trophies.length,
    trophyWeight: 0,
    caps: state.national.caps,
    internationalGoals: state.national.goals,
    clubsPlayedFor: new Set(state.seasons.map((s) => s.clubId)).size,
  };
  for (const s of state.seasons) {
    totals.appearances += s.appearances;
    totals.goals += s.goals;
    totals.assists += s.assists;
    totals.minutes += s.minutes;
  }
  for (const t of state.trophies) {
    totals.trophyWeight += world.competition(t.competitionId).prestige;
  }
  return totals;
}

export function computeEnding(state: CareerState, world: World): Ending {
  const totals = computeTotals(state, world);
  const cap = ceilingOvr(state.player.ceiling, state.player.position);
  const realised = realisation(state.player.attributes, state.player.ceiling, state.player.position);

  const statsScore = clamp(
    ((state.peakOvr - 50) / 49) * 34 +
      Math.min(totals.trophyWeight / 1400, 1) * 24 +
      Math.min(state.peakMarketValue / 180_000_000, 1) * 14 +
      Math.min(totals.caps / 110, 1) * 10 +
      Math.min(totals.internationalGoals / 45, 1) * 5 +
      Math.min(state.national.tournamentsWon / 2, 1) * 9 +
      Math.min(totals.goals / 350, 1) * 4,
    0,
    100,
  );

  // The idol path is measured at the club he finished at, not the best club he
  // ever played for.
  const finalClubId = state.seasons[state.seasons.length - 1]?.clubId ?? state.clubId;
  const home = state.clubStandings.find((c) => c.clubId === finalClubId) ?? null;
  const seasonsThere = state.seasons.filter((s) => s.clubId === finalClubId).length;
  const share = totals.seasons > 0 ? seasonsThere / totals.seasons : 0;
  const idolScore = clamp((home?.standing ?? 0) * 0.62 + share * 100 * 0.38, 0, 100);

  const careerScore = Math.round(statsScore * 0.6 + idolScore * 0.4);

  const tier = pickTier({ statsScore, idolScore, share, standing: home?.standing ?? 0, realised, cap, state, totals });

  return {
    tier,
    label: TIER_LABELS[tier],
    verdict: verdictFor(tier, state, totals, world),
    careerScore,
    statsScore: Math.round(statsScore),
    idolScore: Math.round(idolScore),
    realisation: Math.round(realised * 1000) / 1000,
    ceilingOvr: cap,
    homeClubId: tier === 'statue' || tier === 'cult-hero' ? finalClubId : null,
  };
}

function pickTier(args: {
  statsScore: number;
  idolScore: number;
  share: number;
  standing: number;
  realised: number;
  cap: number;
  state: CareerState;
  totals: CareerTotals;
}): EndingTier {
  const { statsScore, share, standing, realised, cap, state, totals } = args;

  if (standing >= 88 && share > 0.5 && totals.seasons >= 8) return 'statue';
  if (state.peakOvr >= 88 && statsScore >= 62) return 'global-superstar';
  if (totals.trophyWeight >= 900) return 'serial-winner';
  if (cap - state.peakOvr >= 11 && realised < 0.78) return 'what-might-have-been';
  if (standing >= 70 && share > 0.34) return 'cult-hero';
  return 'journeyman';
}

function verdictFor(tier: EndingTier, state: CareerState, totals: CareerTotals, world: World): string {
  const finalClubId = state.seasons[state.seasons.length - 1]?.clubId ?? state.clubId;
  const clubName = world.club(finalClubId).name;
  const name = state.player.surname;
  switch (tier) {
    case 'statue':
      return `${totals.seasons} seasons, most of them at ${clubName}, and he never went looking for more. They will put him outside the ground.`;
    case 'global-superstar':
      return `Peaked at ${state.peakOvr}. Everyone knew the name. Ask ${clubName} supporters whether he was ever really theirs.`;
    case 'serial-winner':
      return `${totals.trophyCount} trophies. He went where the medals were and he collected them.`;
    case 'cult-hero':
      return `Never the best player in the league, but at ${clubName} they still sing about him.`;
    case 'what-might-have-been':
      return `There was more in there. ${name} finished a long way short of what the coaches saw at sixteen.`;
    case 'journeyman':
    default:
      return `${totals.appearances} appearances across ${totals.clubsPlayedFor} clubs. A career, honestly earned, and nobody is building a statue.`;
  }
}

import { clubLeagueId, clubStrength } from '../../league';
import { generateLoanOffers, generateOffers } from '../../transfers';
import type { CareerState, TransferOffer } from '../../types';
import type { World } from '../../world';
import type { Ctx, Effect } from '../types';

/** Short money, the way a newspaper would print it. */
export function money(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  return `€${Math.round(value / 1000)}k`;
}

export function clubName(c: Ctx, clubId: string | undefined): string {
  return clubId ? c.world.club(clubId).name : 'the club';
}

export function currentClub(c: Ctx) {
  return c.world.club(c.state.clubId);
}

export function currentLeague(c: Ctx) {
  return c.world.league(clubLeagueId(c.state.world, c.state.clubId));
}

export function lastSeason(c: Ctx) {
  return c.state.seasons[c.state.seasons.length - 1];
}

export function standingAt(state: CareerState, clubId: string): number {
  return state.clubStandings.find((s) => s.clubId === clubId)?.standing ?? 20;
}

export function seasonsAt(state: CareerState, clubId: string): number {
  return state.clubStandings.find((s) => s.clubId === clubId)?.seasonsServed ?? 0;
}

/** Offers generated for a transfer-flavoured card, drawn on the decisions substream. */
export function offersFor(
  state: CareerState,
  world: World,
  rng: import('../../rng').Rng,
  opts: { includeLoans?: boolean; recentOutput?: number } = {},
): TransferOffer[] {
  const out = generateOffers(rng, {
    state,
    world,
    recentOutput: opts.recentOutput ?? 1,
    mustMove: state.contractYearsRemaining <= 0,
  });
  if (opts.includeLoans) {
    out.push(...generateLoanOffers(rng, { state, world, recentOutput: opts.recentOutput ?? 1, mustMove: false }));
  }
  return out;
}

/** The strongest offer on the table, by the quality of the club making it. */
export function bestOfferIndex(state: CareerState, offers: readonly TransferOffer[]): number {
  let best = -1;
  let bestScore = -Infinity;
  offers.forEach((offer, i) => {
    const score = clubStrength(state.world, offer.clubId);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** The offer promising the most football. */
export function mostMinutesIndex(offers: readonly TransferOffer[]): number {
  let best = -1;
  let bestScore = -Infinity;
  offers.forEach((offer, i) => {
    if (offer.projectedMinutes > bestScore) {
      bestScore = offer.projectedMinutes;
      best = i;
    }
  });
  return best;
}

export const noEffects = (): Effect[] => [];

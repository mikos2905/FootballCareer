import { clubLeagueId, clubStrength } from '../../league';
import { position } from '../../positions';
import { ceilingOvr } from '../../ratings';
import { generateLoanOffers, generateOffers } from '../../transfers';
import type { CareerState, TransferOffer } from '../../types';
import type { World } from '../../world';
import type { AttributeKey } from '../../types';
import type { Ctx, Effect, ImmediateChange, ModifierChannel, StandingTarget } from '../types';

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

/**
 * The three attributes a player's rating actually leans on.
 *
 * A striker's OVR is thirty per cent shooting and seven per cent passing, so
 * `ceiling: { passing: 6 }` moves his rating by four tenths of a point. Cards
 * that mean "this changed what he could become" have to say it in the
 * attributes his position is rated on, or the sentence is a lie for nine
 * positions out of twelve.
 */
function coreAttributes(c: Ctx): AttributeKey[] {
  const weights = position(c.state.player.position).weights;
  return (Object.keys(weights) as AttributeKey[])
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0))
    .slice(0, 3);
}

function spread(c: Ctx, ovrPoints: number): Partial<Record<AttributeKey, number>> {
  const weights = position(c.state.player.position).weights;
  const core = coreAttributes(c);
  const share = core.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
  if (share <= 0) return {};
  // Weighted so the three together move OVR by roughly ovrPoints, whatever the
  // position: a goalkeeper leans on two attributes, a winger on five.
  const per = ovrPoints / share;
  const out: Partial<Record<AttributeKey, number>> = {};
  for (const key of core) out[key] = Math.round(per * 10) / 10;
  return out;
}

/**
 * A ceiling change denominated in OVR rather than in attribute points, spread
 * across what this player's position is rated on. Positive raises what he could
 * become; negative closes it off.
 *
 * A gain shrinks as the headroom does. Elite coaching turns a good prospect into
 * a very good one; it does not turn a generational talent into a better
 * generational talent, and without this the cards stacked ten points onto the
 * players who least needed them and put the top of the rating distribution out
 * of band. Losses are not scaled: the ceiling can always be thrown away.
 */
export const ceilingBy = (c: Ctx, ovrPoints: number): ImmediateChange => {
  if (ovrPoints <= 0) return { ceiling: spread(c, ovrPoints) };
  const current = ceilingOvr(c.state.player.ceiling, c.state.player.position);
  const headroom = Math.max(0, Math.min(1, (99 - current) / 26));
  return { ceiling: spread(c, ovrPoints * headroom) };
};

/** The same, applied to what he is now rather than what he could be. */
export const attributesBy = (c: Ctx, ovrPoints: number): ImmediateChange => ({
  attributes: spread(c, ovrPoints),
});

// ---------------------------------------------------------------------------
// Effect builders
// ---------------------------------------------------------------------------

/** An immediate change. */
export const now = (change: ImmediateChange): Effect => ({ kind: 'immediate', change });

/** A durational modifier the season simulation reads while it is alive. */
export const mod = (
  channel: ModifierChannel,
  value: number,
  seasons: number,
  label: string,
): Effect => ({ kind: 'modifier', modifier: { channel, value, seasons, label } });

/** A training focus, which is a modifier on attributes rather than a number. */
export const focus = (attributes: AttributeKey[], seasons: number, label: string): Effect => ({
  kind: 'modifier',
  modifier: { channel: 'focus', attributes, seasons, label },
});

/** An effect that lands N seasons from now. */
export const later = (seasons: number, label: string, effects: Effect[]): Effect => ({
  kind: 'delayed',
  seasons,
  label,
  effects,
});

/** An effect that may or may not happen, drawn on the decisions substream. */
export const maybe = (
  chance: number,
  label: string,
  then: Effect[],
  otherwise?: Effect[],
): Effect => ({ kind: 'probabilistic', chance, label, then, ...(otherwise ? { otherwise } : {}) });

/** Standing at the club he is at right now. */
export const here = (amount: number): { target: StandingTarget; amount: number } => ({
  target: { kind: 'current' },
  amount,
});

export const stay: Effect = { kind: 'stay' };
export const retire: Effect = { kind: 'retire' };
export const moveTo = (offerIndex: number, reason: 'money' | 'ambition' | 'loyalty' | 'loan' | 'free' | 'forced'): Effect => ({
  kind: 'transfer',
  offerIndex,
  reason,
});

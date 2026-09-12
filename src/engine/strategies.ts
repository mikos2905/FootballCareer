import { clubStrength } from './league';
import { Rng, substream } from './rng';
import type { CareerPolicy, DecisionRequest, TransferRequest } from './career';
import type { TransferOffer } from './types';

/**
 * Stand-in decision policies, for tuning only.
 *
 * These are not the game — phase 3 replaces them with real decision cards the
 * player answers. They exist so the harness can run thousands of careers under
 * consistent, contrasting behaviour and show what the distributions actually
 * look like at the extremes.
 *
 * Policies must not draw from the career's substreams. Where a policy needs
 * randomness it opens its own, derived from the seed.
 */
export type StrategyName = 'greedy' | 'loyal' | 'random' | 'balanced';

export const STRATEGY_NAMES: readonly StrategyName[] = ['greedy', 'loyal', 'random', 'balanced'];

function offerAppeal(request: TransferRequest, offer: TransferOffer): number {
  return clubStrength(request.state.world, offer.clubId) + offer.leagueTier * -6;
}

function shouldRetire(request: DecisionRequest, patience: number): boolean {
  const { state, age } = request;
  const last = state.seasons[state.seasons.length - 1];
  const minutes = last?.minutes ?? 0;
  if (age >= 35 + patience) return true;
  if (age >= 33 && minutes < 900) return true;
  if (minutes < 300 && age >= 33) return true;
  return false;
}

function decideCard(request: DecisionRequest, opts: { patience: number; rng: Rng | null }): number {
  const { card } = request;
  if (card.id === 'retirement-call') {
    return shouldRetire(request, opts.patience) ? 1 : 0;
  }
  if (opts.rng) return opts.rng.int(0, card.options.length - 1);
  if (card.id === 'training-focus') {
    // Rest once the legs need it, technical work otherwise.
    return request.age >= 31 ? 2 : 1;
  }
  if (card.id === 'contract-renewal') return 0;
  return 0;
}

export function makePolicy(name: StrategyName, seed: number): CareerPolicy {
  const rng = name === 'random' ? substream(seed, 'transfers', 999_983) : null;

  switch (name) {
    case 'greedy':
      return {
        decide: (r) => decideCard(r, { patience: 0, rng: null }),
        transfer: (r) => {
          if (r.offers.length === 0) return -1;
          // Always take the best club available, whatever it costs in minutes.
          let best = 0;
          for (let i = 1; i < r.offers.length; i += 1) {
            if (offerAppeal(r, r.offers[i]!) > offerAppeal(r, r.offers[best]!)) best = i;
          }
          const current = clubStrength(r.state.world, r.state.clubId);
          const target = r.offers[best]!;
          if (!r.mustMove && clubStrength(r.state.world, target.clubId) <= current + 1) return -1;
          return best;
        },
      };

    case 'loyal':
      return {
        decide: (r) => decideCard(r, { patience: 2, rng: null }),
        transfer: (r) => (r.mustMove && r.offers.length > 0 ? 0 : -1),
      };

    case 'random':
      return {
        decide: (r) => decideCard(r, { patience: 0, rng }),
        transfer: (r) => {
          if (r.offers.length === 0) return -1;
          if (r.mustMove) return rng!.int(0, r.offers.length - 1);
          return rng!.chance(0.35) ? rng!.int(0, r.offers.length - 1) : -1;
        },
      };

    case 'balanced':
    default:
      return {
        decide: (r) => decideCard(r, { patience: 0, rng: null }),
        transfer: (r) => {
          if (r.offers.length === 0) return -1;
          const current = clubStrength(r.state.world, r.state.clubId);
          const lastMinutes = r.state.seasons[r.state.seasons.length - 1]?.minutes ?? 0;
          const starved = lastMinutes < 1200 && r.age <= 24;

          let best = -1;
          let bestScore = 0;
          for (let i = 0; i < r.offers.length; i += 1) {
            const offer = r.offers[i]!;
            const strength = clubStrength(r.state.world, offer.clubId);
            // A better club is worth having, but not at the cost of playing.
            const minutesValue = (offer.projectedMinutes / 3420) * 12;
            const step = strength - current;
            const score = step * 1.1 + minutesValue + (starved && offer.loan ? 14 : 0);
            if (score > bestScore) {
              bestScore = score;
              best = i;
            }
          }
          if (r.mustMove) return best >= 0 ? best : 0;
          // Only move for a clear improvement.
          return bestScore >= 15 ? best : -1;
        },
      };
  }
}

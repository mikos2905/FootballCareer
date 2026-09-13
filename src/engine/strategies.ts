import { clubStrength } from './league';
import { Rng, substream } from './rng';
import type { CareerPolicy, DecisionRequest, TransferRequest } from './career';
import type { PresentedCard } from './decisions';
import type { TransferOffer } from './types';

/**
 * Stand-in decision policies, for tuning and for the balance suite.
 *
 * These are not the game — a person answers the cards. They exist so the
 * harness can run thousands of careers under consistent, contrasting behaviour,
 * and so the dominance and dead-option tests have something to hold constant
 * while they vary one decision.
 *
 * Policies must not draw from the career's substreams. Where a policy needs
 * randomness it opens its own, derived from the seed.
 */
export type StrategyName = 'greedy' | 'loyal' | 'random' | 'balanced';

export const STRATEGY_NAMES: readonly StrategyName[] = ['greedy', 'loyal', 'random', 'balanced'];

function optionIndex(card: PresentedCard, ...preferred: string[]): number {
  for (const id of preferred) {
    const i = card.options.findIndex((o) => o.id === id);
    if (i >= 0) return i;
  }
  return 0;
}

function offerAppeal(request: TransferRequest, offer: TransferOffer): number {
  return clubStrength(request.state.world, offer.clubId) + offer.leagueTier * -6;
}

function shouldRetire(request: DecisionRequest, patience: number): boolean {
  const { state, age } = request;
  const minutes = state.seasons[state.seasons.length - 1]?.minutes ?? 0;
  if (age >= 34 + patience) return true;
  if (age >= 33 && minutes < 900) return true;
  if (minutes < 300 && age >= 33) return true;
  return false;
}

/** How each stand-in answers the real card set. */
function decideCard(request: DecisionRequest, opts: { patience: number; rng: Rng | null; bias: StrategyName }): number {
  const { card, age } = request;
  if (opts.rng) return opts.rng.int(0, card.options.length - 1);

  switch (card.cardId) {
    case 'testimonial-or-one-more':
      if (shouldRetire(request, opts.patience)) return optionIndex(card, 'testimonial');
      return opts.bias === 'loyal'
        ? optionIndex(card, 'one-more-here')
        : optionIndex(card, 'drop-down-and-play', 'one-more-here');

    case 'first-contract':
      return opts.bias === 'loyal'
        ? optionIndex(card, 'sign-clean')
        : opts.bias === 'greedy'
          ? optionIndex(card, 'push-wage')
          : optionIndex(card, 'sign-clean');

    case 'bench-at-a-giant':
      return opts.bias === 'greedy' ? optionIndex(card, 'take-it') : optionIndex(card, 'stay-and-play');

    case 'loan-or-fight':
      return opts.bias === 'loyal' ? optionIndex(card, 'stay-and-fight') : optionIndex(card, 'go-on-loan');

    case 'agent-wants-gulf':
      return opts.bias === 'greedy'
        ? optionIndex(card, 'take-the-money')
        : opts.bias === 'loyal'
          ? optionIndex(card, 'turn-it-down')
          : optionIndex(card, 'use-it-as-leverage');

    case 'derby-half-fit':
      return opts.bias === 'loyal' ? optionIndex(card, 'play') : optionIndex(card, 'sit-it-out', 'play');

    case 'captains-armband':
      return opts.bias === 'greedy' ? optionIndex(card, 'decline') : optionIndex(card, 'take-it');

    case 'new-manager':
      return opts.bias === 'loyal'
        ? optionIndex(card, 'knuckle-down')
        : optionIndex(card, 'ask-to-leave', 'knuckle-down');

    case 'training-focus':
      if (age >= 31) return optionIndex(card, 'rest', 'shore-up');
      return opts.bias === 'greedy' ? optionIndex(card, 'sharpen') : optionIndex(card, 'shore-up', 'sharpen');

    case 'nationality-choice':
      // Take the caps on offer rather than waiting on a call that may never come.
      return opts.bias === 'loyal' ? optionIndex(card, 'home') : Math.min(1, card.options.length - 1);

    case 'seasonal-outlook':
      return opts.bias === 'greedy' ? optionIndex(card, 'extra-work') : optionIndex(card, 'professional');

    default:
      return 0;
  }
}

export function makePolicy(name: StrategyName, seed: number): CareerPolicy {
  const rng = name === 'random' ? substream(seed, 'transfers', 999_983) : null;
  const patience = name === 'loyal' ? 2 : 0;

  const decide = (r: DecisionRequest) => decideCard(r, { patience, rng, bias: name });

  switch (name) {
    case 'greedy':
      return {
        decide,
        transfer: (r) => {
          if (r.offers.length === 0) return -1;
          let best = 0;
          for (let i = 1; i < r.offers.length; i += 1) {
            if (offerAppeal(r, r.offers[i]!) > offerAppeal(r, r.offers[best]!)) best = i;
          }
          const current = clubStrength(r.state.world, r.state.clubId);
          if (!r.mustMove && clubStrength(r.state.world, r.offers[best]!.clubId) <= current + 1) return -1;
          return best;
        },
      };

    case 'loyal':
      return { decide, transfer: (r) => (r.mustMove && r.offers.length > 0 ? 0 : -1) };

    case 'random':
      return {
        decide,
        transfer: (r) => {
          if (r.offers.length === 0) return -1;
          if (r.mustMove) return rng!.int(0, r.offers.length - 1);
          return rng!.chance(0.35) ? rng!.int(0, r.offers.length - 1) : -1;
        },
      };

    case 'balanced':
    default:
      return {
        decide,
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
            const minutesValue = (offer.projectedMinutes / 3420) * 12;
            const score = (strength - current) * 1.1 + minutesValue + (starved && offer.loan ? 14 : 0);
            if (score > bestScore) {
              bestScore = score;
              best = i;
            }
          }
          if (r.mustMove) return best >= 0 ? best : 0;
          return bestScore >= 15 ? best : -1;
        },
      };
  }
}

/** Answers every card with a fixed option index. Used by the balance suite. */
export function pinnedPolicy(base: CareerPolicy, cardId: string, optionId: string): CareerPolicy {
  let used = false;
  return {
    ...base,
    decide: (r) => {
      if (!used && r.card.cardId === cardId) {
        const i = r.card.options.findIndex((o) => o.id === optionId);
        if (i >= 0) {
          used = true;
          return i;
        }
      }
      return base.decide(r);
    },
  };
}

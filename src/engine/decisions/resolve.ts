import type { Rng } from '../rng';
import type { CareerState } from '../types';
import type { World } from '../world';
import { applyEffects, type EffectContext } from './effects';
import { card, prepare, present } from './registry';
import type { PresentedCard, ShownCard, TransferReason } from './types';

/**
 * applyDecision(state, cardId, optionId, rng) -> newState
 *
 * Pure and deterministic: no side effects, no I/O. Immediate effects apply,
 * modifiers register with an expiry, delayed effects push onto the queue, and
 * probabilistic effects draw from the rng the caller took from
 * substream(seed, 'decisions', season).
 *
 * The input state is not mutated — it is cloned first, so callers can hold a
 * snapshot and branch from it, which is what the balance suite does.
 */
export interface DecisionOutcome {
  state: CareerState;
  /** Set when the chosen option moved the player. Index into subject.offers. */
  transfer: { offerIndex: number; reason: TransferReason } | null;
  declaredNation: string | null;
  retire: boolean;
  stay: boolean;
  /** Re-applied after a move in the same option, so a pay rise survives it. */
  wageMultiplier: number;
  /** What actually happened, including which way probabilistic effects fell. */
  log: string[];
}

export function cloneState(state: CareerState): CareerState {
  return structuredClone(state);
}

export function applyDecision(
  state: CareerState,
  cardId: string,
  optionId: string,
  rng: Rng,
  world: World,
  /** Reuses a subject resolved earlier, so a replay shows the same card. */
  subject?: ShownCard['subject'],
): DecisionOutcome {
  const next = cloneState(state);
  const def = card(cardId);
  const ctx = subject ? { state: next, world, subject } : prepare(def, next, world, rng);

  const options = def.options(ctx);
  const index = options.findIndex((o) => o.id === optionId);
  const option = options[index];
  if (!option) throw new Error(`Card ${cardId} has no option ${optionId}`);

  const context: EffectContext = { state: next, rng, source: cardId, log: [] };
  applyEffects(context, option.effects(ctx));

  next.cardHistory.push({
    season: next.season,
    cardId,
    optionId,
    optionIndex: index,
    subject: ctx.subject,
  });
  next.decisions.push({ season: next.season, cardId, optionId, optionIndex: index });

  return {
    state: next,
    transfer: context.transfer ? { offerIndex: context.transfer.offerIndex, reason: context.transfer.reason as TransferReason } : null,
    declaredNation: context.declaredNation ?? null,
    retire: context.retire === true,
    stay: context.stay === true,
    wageMultiplier: context.wageMultiplier ?? 1,
    log: context.log,
  };
}

/** Presents a card without answering it — for the terminal player and the UI. */
export function presentCard(
  state: CareerState,
  world: World,
  cardId: string,
  rng: Rng,
  subject?: ShownCard['subject'],
): PresentedCard {
  const def = card(cardId);
  const ctx = subject ? { state, world, subject } : prepare(def, state, world, rng);
  return present(def, ctx);
}

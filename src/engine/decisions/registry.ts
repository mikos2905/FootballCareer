import { substream, type Rng } from '../rng';
import type { CareerState } from '../types';
import type { World } from '../world';
import { contractCards } from './cards/contract';
import { squadCards } from './cards/squad';
import { trainingCards, seasonalOutlook } from './cards/training';
import { transferCards } from './cards/transfer';
import type { Card, Ctx, PresentedCard } from './types';

/** The ten cards, plus the seasonal fallback. */
export const CARDS: readonly Card[] = [
  ...contractCards,
  ...transferCards,
  ...squadCards,
  ...trainingCards,
];

export function card(id: string): Card {
  const found = CARDS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown card: ${id}`);
  return found;
}

/** Cards that answer scheduled beats, by beat id. */
export function cardsForBeat(beat: string): Card[] {
  return CARDS.filter((c) => c.beat === beat);
}

function beatHasFired(state: CareerState, beat: string): boolean {
  return state.firedBeats.some((entry) => entry.split(':')[0] === beat);
}

function timesShown(state: CareerState, cardId: string): number {
  return state.cardHistory.filter((h) => h.cardId === cardId).length;
}

function lastShownSeason(state: CareerState, cardId: string): number | null {
  let latest: number | null = null;
  for (const entry of state.cardHistory) {
    if (entry.cardId === cardId) latest = latest === null ? entry.season : Math.max(latest, entry.season);
  }
  return latest;
}

/** Cooldown and once-per-career, checked before eligibility so they are cheap. */
export function isAvailable(state: CareerState, def: Card): boolean {
  if (def.oncePerCareer && timesShown(state, def.id) > 0) return false;
  if (def.cooldownSeasons !== undefined) {
    const last = lastShownSeason(state, def.id);
    if (last !== null && state.season - last < def.cooldownSeasons) return false;
  }
  return true;
}

/** Resolves the concrete subjects a card is about. */
export function prepare(def: Card, state: CareerState, world: World, rng: Rng): Ctx {
  const subject = def.prepare ? def.prepare(state, world, rng) : {};
  return { state, world, subject };
}

export interface Selection {
  def: Card;
  ctx: Ctx;
  beat: string | null;
}

/**
 * Picks the card for this decision point.
 *
 * A due scheduled beat takes priority. Otherwise everything eligible is
 * weighted and drawn from the decisions substream. If nothing at all is
 * eligible, the seasonal fallback runs — a silent season feels broken.
 */
export function selectCard(
  state: CareerState,
  world: World,
  dueBeats: readonly string[],
  rng: Rng,
): Selection {
  for (const beat of dueBeats) {
    const candidates = cardsForBeat(beat).filter((def) => {
      if (!isAvailable(state, def)) return false;
      const ctx = prepare(def, state, world, rng);
      return def.eligibility(ctx);
    });
    if (candidates.length > 0) {
      const def = rng.weighted(candidates, (d) => Math.max(d.weight(prepare(d, state, world, rng)), 0.01));
      return { def, ctx: prepare(def, state, world, rng), beat };
    }
  }

  const eligible: { def: Card; ctx: Ctx; weight: number }[] = [];
  for (const def of CARDS) {
    if (def.id === seasonalOutlook.id) continue;
    // A card that answers a scheduled beat waits for that beat. Otherwise a
    // seventeen-year-old who has played four games gets handed the
    // international allegiance decision, which is nonsense.
    if (def.beat && !beatHasFired(state, def.beat)) continue;
    if (!isAvailable(state, def)) continue;
    const ctx = prepare(def, state, world, rng);
    if (!def.eligibility(ctx)) continue;
    const weight = def.weight(ctx);
    if (weight <= 0) continue;
    // A card already seen this run is less interesting than one that has not been.
    const seen = timesShown(state, def.id);
    eligible.push({ def, ctx, weight: weight / (1 + seen * 0.8) });
  }

  if (eligible.length === 0) {
    return { def: seasonalOutlook, ctx: prepare(seasonalOutlook, state, world, rng), beat: null };
  }
  const picked = rng.weighted(eligible, (e) => e.weight);
  return { def: picked.def, ctx: picked.ctx, beat: null };
}

/** Resolves a card's text and options against a prepared context. */
export function present(def: Card, ctx: Ctx): PresentedCard {
  return {
    cardId: def.id,
    category: def.category,
    title: def.title(ctx),
    situation: def.situation(ctx),
    subject: ctx.subject,
    options: def.options(ctx).map((o) => ({ id: o.id, label: o.label(ctx), detail: o.detail(ctx) })),
  };
}

/** The rng a decision point draws from. Never the shared stream. */
export function decisionRng(seed: number, season: number): Rng {
  return substream(seed, 'decisions', season);
}

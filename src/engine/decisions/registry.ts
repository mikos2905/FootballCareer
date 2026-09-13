import { substream, type Rng } from '../rng';
import type { CareerState } from '../types';
import type { World } from '../world';
import { breakthroughCards } from './cards/breakthrough';
import { contractCards } from './cards/contract';
import { declineCards, twilightCards } from './cards/late';
import { primeCards } from './cards/prime';
import { squadCards } from './cards/squad';
import { trainingCards, seasonalOutlook } from './cards/training';
import { transferCards } from './cards/transfer';
import { youthCards } from './cards/youth';
import { stageForAge, type Card, type Category, type Ctx, type PresentedCard, type Stage } from './types';

/** The whole set, organised by the career stage each card was written for. */
export const CARDS: readonly Card[] = [
  ...contractCards,
  ...transferCards,
  ...squadCards,
  ...trainingCards,
  ...youthCards,
  ...breakthroughCards,
  ...primeCards,
  ...declineCards,
  ...twilightCards,
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

/**
 * Cooldown and once-per-career.
 *
 * With a set this size, nothing should come up twice in one career: a repeat is
 * the moment a run stops feeling like a life and starts feeling like a deck.
 * Cards that are meant to recur say so with an explicit cooldown; everything
 * else is once per career by default.
 */
export function isAvailable(state: CareerState, def: Card): boolean {
  const shown = timesShown(state, def.id);
  if (def.cooldownSeasons === undefined) return shown === 0;
  if (def.oncePerCareer && shown > 0) return false;
  const last = lastShownSeason(state, def.id);
  return last === null || state.season - last >= def.cooldownSeasons;
}

/** Categories seen in the last few decisions, for steering away from them. */
function recentCategories(state: CareerState, within = 3): Category[] {
  const recent = state.cardHistory.filter((h) => state.season - h.season <= within);
  return recent
    .map((h) => CARDS.find((c) => c.id === h.cardId)?.category)
    .filter((c): c is Category => c !== undefined);
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
  const recent = recentCategories(state);
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

    // Cards written for this stage of a career are what the stage is for.
    const stage = stageForAge(state.player.age);
    const stageFit = def.stages.includes(stage) ? 1 : 0.15;

    // A card eligible across four stages enters four times as many draws as one
    // written for a single stage, so at equal weight it turns up in almost every
    // career. Normalise by breadth and the broad cards stop crowding out the
    // specific ones, which are the cards that make a run feel like a life.
    const breadth = 1 / Math.sqrt(def.stages.length);

    // Three transfer cards in a row reads as a game with one idea. Steer away
    // from whatever the last few decisions were about.
    const recentlySeen = recent.filter((c) => c === def.category).length;
    const categoryFatigue = 1 / (1 + recentlySeen * 1.2);

    const seen = timesShown(state, def.id);
    eligible.push({
      def,
      ctx,
      weight: (weight * stageFit * breadth * categoryFatigue) / (1 + seen * 0.8),
    });
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

/** Cards written for a stage, for the coverage matrix. */
export function cardsForStage(stage: Stage): Card[] {
  return CARDS.filter((c) => c.stages.includes(stage));
}

/** Cards written for a stage and a category. */
export function cardsFor(stage: Stage, category: Category): Card[] {
  return CARDS.filter((c) => c.stages.includes(stage) && c.category === category);
}

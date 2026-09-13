import type { AttributeKey, CareerState, TransferOffer } from '../types';
import type { World } from '../world';

/**
 * The decision layer's data model.
 *
 * Effects are declarative data, never imperative callbacks. The balance suite
 * has to reason about what an option does without running it, and a callback is
 * opaque to that.
 */

export type Category =
  | 'contract'
  | 'transfer'
  | 'loan'
  | 'dressing-room'
  | 'training'
  | 'injury'
  | 'lifestyle'
  | 'international'
  | 'loyalty'
  | 'retirement';

export type CardKind = 'scheduled' | 'opportunistic';

/**
 * Career stages. A career that reaches a stage with nothing to say falls back
 * to generic cards, and that is where a run starts feeling thin — so the set is
 * organised by stage and a test checks every stage is served.
 */
export type Stage = 'youth' | 'breakthrough' | 'prime' | 'decline' | 'twilight';

export const STAGES: readonly Stage[] = ['youth', 'breakthrough', 'prime', 'decline', 'twilight'];

export const STAGE_AGES: Record<Stage, { from: number; to: number }> = {
  youth: { from: 16, to: 19 },
  breakthrough: { from: 19, to: 23 },
  prime: { from: 23, to: 30 },
  decline: { from: 30, to: 34 },
  twilight: { from: 34, to: 99 },
};

export function stageForAge(age: number): Stage {
  if (age < 19) return 'youth';
  if (age < 23) return 'breakthrough';
  if (age < 30) return 'prime';
  if (age < 34) return 'decline';
  return 'twilight';
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/** What a durational modifier acts on while it is alive. */
export type ModifierChannel =
  | 'minutes'
  | 'development'
  | 'injuryRisk'
  /** Adds points to squad standing, so a manager's opinion can outlive a season. */
  | 'standing'
  /** Attribute focus for training. */
  | 'focus';

export interface ModifierSpec {
  channel: ModifierChannel;
  /** Multiplier for minutes/development/injuryRisk; points for standing. */
  value?: number;
  attributes?: readonly AttributeKey[];
  /** Seasons it stays alive, counting the season it is applied. */
  seasons: number;
  /** Shown to the player so an active modifier is never a mystery. */
  label: string;
}

export interface ActiveModifier extends ModifierSpec {
  id: string;
  /** Card that created it, so effects can be traced and expired cleanly. */
  source: string;
  /** Career season index after which it stops applying. */
  expiresAfterSeason: number;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Where a club-standing change lands. Captured club ids survive a transfer. */
export type StandingTarget = { kind: 'current' } | { kind: 'club'; clubId: string };

export interface ImmediateChange {
  attributes?: Partial<Record<AttributeKey, number>>;
  ceiling?: Partial<Record<AttributeKey, number>>;
  reputation?: number;
  form?: number;
  wear?: number;
  injuryProneness?: number;
  managerRelationship?: number;
  nationalStanding?: number;
  /** Additive points, against a target that survives a later transfer. */
  clubStanding?: { target: StandingTarget; amount: number };
  /** Multipliers. */
  wage?: number;
  marketValue?: number;
  /** Absolute. */
  contractYears?: number;
}

export type Effect =
  | { kind: 'immediate'; change: ImmediateChange; note?: string }
  | { kind: 'modifier'; modifier: ModifierSpec }
  /**
   * Fires N seasons later. The queue is part of game state and serialisable,
   * and a delayed effect fires correctly even if the player has since moved
   * club — anything club-specific captures the club id at the time it is
   * queued.
   */
  | { kind: 'delayed'; seasons: number; label: string; effects: Effect[] }
  /** Draws from the decisions substream, never the shared stream. */
  | { kind: 'probabilistic'; chance: number; label: string; then: Effect[]; otherwise?: Effect[] }
  | { kind: 'transfer'; offerIndex: number; reason: TransferReason }
  | { kind: 'stay' }
  | { kind: 'declareFor'; nationId: string }
  | { kind: 'retire' };

export type TransferReason = 'money' | 'ambition' | 'loyalty' | 'loan' | 'free' | 'forced';

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * The concrete things a card is about, resolved once when the card is drawn.
 *
 * Cards name the actual club, the actual rival, the actual figure. "Sassuolo
 * want you" reads as a career; "a mid-table club want you" reads as a
 * spreadsheet. Resolving subjects up front and recording them keeps a replay
 * byte-identical.
 */
export interface CardSubject {
  clubId?: string;
  rivalClubId?: string;
  nationId?: string;
  offers?: TransferOffer[];
  /** Free-form resolved values a card needs in its text. */
  values?: Record<string, number>;
  labels?: Record<string, string>;
}

/** Everything a card's text and options are functions of. */
export interface Ctx {
  state: CareerState;
  world: World;
  subject: CardSubject;
}

export interface Option {
  id: string;
  label: (c: Ctx) => string;
  /** One line under the label. Honest framing, never a number, never "safe vs risky". */
  detail: (c: Ctx) => string;
  effects: (c: Ctx) => Effect[];
}

export interface Card {
  id: string;
  category: Category;
  kind: CardKind;
  /** Stages this card belongs to. Used by the coverage matrix and the weighting. */
  stages: Stage[];
  /** Scheduled cards name the beat they answer. */
  beat?: string;
  eligibility: (c: Ctx) => boolean;
  /** 0 = never. Higher = more likely in the weighted draw. */
  weight: (c: Ctx) => number;
  cooldownSeasons?: number;
  oncePerCareer?: boolean;
  /** Resolves the concrete subjects. Deterministic: draws from the decisions substream. */
  prepare?: (state: CareerState, world: World, rng: import('../rng').Rng) => CardSubject;
  title: (c: Ctx) => string;
  situation: (c: Ctx) => string;
  options: (c: Ctx) => Option[];
}

/** A card as presented: text already resolved, ready to show or to answer. */
export interface PresentedCard {
  cardId: string;
  category: Category;
  title: string;
  situation: string;
  subject: CardSubject;
  options: { id: string; label: string; detail: string }[];
}

/** What was shown and chosen, enough to replay it exactly. */
export interface ShownCard {
  season: number;
  cardId: string;
  optionId: string;
  optionIndex: number;
  subject: CardSubject;
}

/** A delayed effect waiting in the queue. Serialisable, part of game state. */
export interface PendingEffect {
  id: string;
  /** Career season index at which it fires. */
  dueSeason: number;
  /** Card that queued it. */
  source: string;
  label: string;
  effects: Effect[];
}

import { clamp, type Rng } from '../rng';
import { ATTRIBUTE_KEYS, type CareerState } from '../types';
import type {
  ActiveModifier,
  Effect,
  ImmediateChange,
  ModifierChannel,
  PendingEffect,
  StandingTarget,
} from './types';

/**
 * Applying declarative effects to career state.
 *
 * Pure and deterministic. Probabilistic effects draw from the rng they are
 * handed, which the caller has taken from substream(seed, 'decisions', season).
 */

export interface EffectContext {
  state: CareerState;
  rng: Rng;
  /** Card or pending-effect id, recorded as the source of anything durational. */
  source: string;
  /** Resolved transfer, if an option chose one. Read by the career loop. */
  transfer?: { offerIndex: number; reason: string };
  declaredNation?: string;
  retire?: boolean;
  stay?: boolean;
  /**
   * Product of the option's wage multipliers. When the same option also moves
   * the player, the new club sets the wage afterwards, so the multiplier has to
   * be re-applied on top of the new deal or the money vanishes.
   */
  wageMultiplier?: number;
  /** Human-readable trace of what actually happened, for transcripts. */
  log: string[];
}

function standingRecord(state: CareerState, clubId: string) {
  let found = state.clubStandings.find((c) => c.clubId === clubId);
  if (!found) {
    found = {
      clubId,
      standing: 20,
      seasonsServed: 0,
      appearances: 0,
      goals: 0,
      assists: 0,
      trophiesWon: 0,
      leftForMoney: false,
    };
    state.clubStandings.push(found);
  }
  return found;
}

function resolveTarget(state: CareerState, target: StandingTarget): string {
  return target.kind === 'current' ? state.clubId : target.clubId;
}

export function applyImmediate(state: CareerState, change: ImmediateChange): void {
  const { player } = state;

  if (change.attributes) {
    for (const key of ATTRIBUTE_KEYS) {
      const delta = change.attributes[key];
      if (delta === undefined) continue;
      player.attributes[key] = clamp(player.attributes[key] + delta, 1, player.ceiling[key]);
    }
  }
  if (change.ceiling) {
    for (const key of ATTRIBUTE_KEYS) {
      const delta = change.ceiling[key];
      if (delta === undefined) continue;
      player.ceiling[key] = clamp(player.ceiling[key] + delta, 1, 99);
    }
  }
  if (change.reputation !== undefined) {
    player.reputation = clamp(player.reputation + change.reputation, 1, 99);
  }
  if (change.form !== undefined) state.condition.form = clamp(state.condition.form + change.form, -20, 20);
  if (change.wear !== undefined) state.condition.wear = clamp(state.condition.wear + change.wear, 0, 100);
  if (change.injuryProneness !== undefined) {
    state.condition.injuryProneness = clamp(state.condition.injuryProneness + change.injuryProneness, 1, 99);
  }
  if (change.managerRelationship !== undefined) {
    state.condition.managerRelationship = clamp(
      state.condition.managerRelationship + change.managerRelationship,
      -100,
      100,
    );
  }
  if (change.nationalStanding !== undefined) {
    state.national.standing = clamp(state.national.standing + change.nationalStanding, 0, 100);
  }
  if (change.clubStanding) {
    const record = standingRecord(state, resolveTarget(state, change.clubStanding.target));
    record.standing = clamp(record.standing + change.clubStanding.amount, 1, 99);
    if (change.clubStanding.amount <= -20) record.leftForMoney = true;
  }
  if (change.wage !== undefined) state.wage = Math.round(state.wage * change.wage);
  if (change.marketValue !== undefined) {
    player.marketValue = Math.round(player.marketValue * change.marketValue);
  }
  if (change.contractYears !== undefined) {
    state.contractYearsRemaining = Math.max(0, change.contractYears);
  }
}

/**
 * Captures "the club I am at now" into a concrete club id, so a delayed effect
 * lands where it was aimed even after the player has moved on.
 */
function captureTargets(state: CareerState, effects: Effect[]): Effect[] {
  return effects.map((effect) => {
    if (effect.kind === 'immediate' && effect.change.clubStanding?.target.kind === 'current') {
      return {
        ...effect,
        change: {
          ...effect.change,
          clubStanding: { ...effect.change.clubStanding, target: { kind: 'club', clubId: state.clubId } },
        },
      };
    }
    if (effect.kind === 'delayed') return { ...effect, effects: captureTargets(state, effect.effects) };
    if (effect.kind === 'probabilistic') {
      return {
        ...effect,
        then: captureTargets(state, effect.then),
        otherwise: effect.otherwise ? captureTargets(state, effect.otherwise) : undefined,
      };
    }
    return effect;
  });
}

export function applyEffects(context: EffectContext, effects: readonly Effect[]): void {
  for (const effect of effects) applyEffect(context, effect);
}

function applyEffect(context: EffectContext, effect: Effect): void {
  const { state, rng } = context;
  switch (effect.kind) {
    case 'immediate':
      if (effect.change.wage !== undefined) {
        context.wageMultiplier = (context.wageMultiplier ?? 1) * effect.change.wage;
      }
      applyImmediate(state, effect.change);
      if (effect.note) context.log.push(effect.note);
      return;

    case 'modifier': {
      const modifier: ActiveModifier = {
        ...effect.modifier,
        id: `${context.source}:${effect.modifier.channel}:${state.season}`,
        source: context.source,
        expiresAfterSeason: state.season + Math.max(0, effect.modifier.seasons - 1),
      };
      // One source never stacks the same channel on itself.
      state.modifiers = state.modifiers.filter(
        (m) => !(m.source === modifier.source && m.channel === modifier.channel),
      );
      state.modifiers.push(modifier);
      return;
    }

    case 'delayed': {
      const pending: PendingEffect = {
        id: `${context.source}:${state.season}:${state.pending.length}`,
        dueSeason: state.season + Math.max(1, effect.seasons),
        source: context.source,
        label: effect.label,
        effects: captureTargets(state, effect.effects),
      };
      state.pending.push(pending);
      return;
    }

    case 'probabilistic': {
      if (rng.chance(clamp(effect.chance, 0, 1))) {
        context.log.push(effect.label);
        applyEffects(context, effect.then);
      } else if (effect.otherwise) {
        applyEffects(context, effect.otherwise);
      }
      return;
    }

    case 'transfer':
      context.transfer = { offerIndex: effect.offerIndex, reason: effect.reason };
      return;

    case 'stay':
      context.stay = true;
      return;

    case 'declareFor':
      context.declaredNation = effect.nationId;
      return;

    case 'retire':
      context.retire = true;
      return;
  }
}

/**
 * Drains the delayed queue for the season about to be played. Runs before the
 * simulation, so an effect that lands this year is felt this year.
 */
export function drainQueue(state: CareerState, rng: Rng): string[] {
  const due = state.pending.filter((p) => p.dueSeason <= state.season);
  if (due.length === 0) return [];
  state.pending = state.pending.filter((p) => p.dueSeason > state.season);

  const log: string[] = [];
  for (const pending of due) {
    const context: EffectContext = { state, rng, source: pending.source, log };
    log.push(pending.label);
    applyEffects(context, pending.effects);
  }
  return log;
}

/** Drops modifiers whose time is up. */
export function expireModifiers(state: CareerState): void {
  state.modifiers = state.modifiers.filter((m) => m.expiresAfterSeason >= state.season);
}

export interface ResolvedModifiers {
  minutesFactor: number;
  developmentFactor: number;
  injuryRiskFactor: number;
  standingBonus: number;
  focus: string[];
  labels: string[];
}

/**
 * Bounds on the folded modifiers.
 *
 * Modifiers multiply, so three overlapping minutes bonuses reach 2.3x and a
 * player holds down a place at a club he has no business at. Cards should tilt
 * a career, not override the simulation underneath it.
 */
const MODIFIER_BOUNDS = {
  minutes: [0.25, 1.45],
  development: [0.3, 1.4],
  injuryRisk: [0.5, 2.4],
  standing: [-10, 8],
} as const;

/** Folds the live modifiers into the multipliers the season simulation reads. */
export function resolveModifiers(state: CareerState): ResolvedModifiers {
  const out: ResolvedModifiers = {
    minutesFactor: 1,
    developmentFactor: 1,
    injuryRiskFactor: 1,
    standingBonus: 0,
    focus: [],
    labels: [],
  };
  for (const modifier of state.modifiers) {
    if (modifier.expiresAfterSeason < state.season) continue;
    out.labels.push(modifier.label);
    const value = modifier.value ?? 1;
    const channel: ModifierChannel = modifier.channel;
    if (channel === 'minutes') out.minutesFactor *= value;
    else if (channel === 'development') out.developmentFactor *= value;
    else if (channel === 'injuryRisk') out.injuryRiskFactor *= value;
    else if (channel === 'standing') out.standingBonus += modifier.value ?? 0;
    else if (channel === 'focus' && modifier.attributes) out.focus.push(...modifier.attributes);
  }
  out.minutesFactor = clamp(out.minutesFactor, MODIFIER_BOUNDS.minutes[0], MODIFIER_BOUNDS.minutes[1]);
  out.developmentFactor = clamp(
    out.developmentFactor,
    MODIFIER_BOUNDS.development[0],
    MODIFIER_BOUNDS.development[1],
  );
  out.injuryRiskFactor = clamp(
    out.injuryRiskFactor,
    MODIFIER_BOUNDS.injuryRisk[0],
    MODIFIER_BOUNDS.injuryRisk[1],
  );
  out.standingBonus = clamp(out.standingBonus, MODIFIER_BOUNDS.standing[0], MODIFIER_BOUNDS.standing[1]);
  return out;
}

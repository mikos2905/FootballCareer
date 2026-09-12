import { position } from './positions';
import { clamp, Rng } from './rng';
import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, type PositionId } from './types';

/**
 * Development is asymptotic: each season closes some fraction of the remaining
 * gap to the hidden ceiling. The fraction falls away with age, so the ceiling is
 * approached and only rarely touched — you need minutes, luck with injuries and
 * the right training decisions to actually get there.
 *
 * NOTE (phase 2): the constants here are plausible but untuned. The CLI harness
 * is where they get fitted against the distribution targets in the brief.
 */

/** Share of the remaining gap a season can close, before modifiers. */
export function growthRate(age: number): number {
  return 0.21 * Math.exp(-Math.pow(Math.max(0, age - 16) / 8, 1.8));
}

interface DeclineProfile {
  startAge: number;
  perSeason: number;
}

const DECLINE: Record<AttributeKey, DeclineProfile> = {
  pace: { startAge: 29, perSeason: 1.6 },
  physical: { startAge: 30, perSeason: 1.15 },
  dribbling: { startAge: 30, perSeason: 0.9 },
  shooting: { startAge: 31, perSeason: 0.35 },
  defending: { startAge: 32, perSeason: 0.35 },
  passing: { startAge: 33, perSeason: 0.15 },
  flair: { startAge: 33, perSeason: 0.15 },
  weakFoot: { startAge: 33, perSeason: 0.1 },
};

export interface DevelopmentInputs {
  age: number;
  minutes: number;
  /** 0-100 strength of the league played in. Harder football develops players faster. */
  leagueStrength: number;
  /** Weeks lost to injury across the season. */
  injuryWeeks: number;
  /** 0-100 accumulated mileage. Makes decline bite harder. */
  wear: number;
  /** Multiplier from training decisions and pending effects. 1 = neutral. */
  developmentFactor: number;
  /** Attributes a training focus is pushing this season. */
  focus?: readonly AttributeKey[];
}

export interface DevelopmentResult {
  attributes: Attributes;
  /** Per-attribute change, for coach dialogue and the season report. */
  deltas: Record<AttributeKey, number>;
}

/** Minutes a full season of first-team football looks like. */
export const FULL_SEASON_MINUTES = 2700;

export function developAttributes(
  rng: Rng,
  current: Attributes,
  ceiling: Attributes,
  pos: PositionId,
  inputs: DevelopmentInputs,
): DevelopmentResult {
  const weights = position(pos).weights;
  const base = growthRate(inputs.age);

  const minutesFactor = clamp(0.25 + (inputs.minutes / FULL_SEASON_MINUTES) * 0.95, 0.25, 1.15);
  const leagueFactor = 0.8 + (inputs.leagueStrength / 100) * 0.4;
  const injuryFactor = clamp(1 - inputs.injuryWeeks / 42, 0.4, 1);
  const focusSet = new Set(inputs.focus ?? []);

  const attributes = { ...current };
  const deltas = {} as Record<AttributeKey, number>;

  for (const key of ATTRIBUTE_KEYS) {
    const cap = ceiling[key];
    const now = current[key];
    const gap = Math.max(0, cap - now);

    // You develop what you actually use in your position, plus whatever you are
    // deliberately training.
    const relevance = clamp(0.6 + (weights[key] ?? 0) * 3, 0.7, 1.35);
    const focusBoost = focusSet.has(key) ? 1.45 : focusSet.size > 0 ? 0.85 : 1;

    const luck = rng.around(1, 0.14, 0.62, 1.38);
    const rate =
      base * minutesFactor * leagueFactor * injuryFactor * relevance * focusBoost * inputs.developmentFactor * luck;

    let change = gap * rate;

    // Bounded bad luck: a young player keeps developing even after a rotten
    // season, so a run cannot die in its first ninety seconds.
    if (inputs.age <= 21) change = Math.max(change, gap * 0.035);

    const profile = DECLINE[key];
    if (inputs.age >= profile.startAge) {
      const years = inputs.age - profile.startAge;
      const wearFactor = 1 + inputs.wear / 140;
      change -= profile.perSeason * (1 + years * 0.35) * wearFactor * rng.around(1, 0.18, 0.55, 1.45);
    }

    const next = clamp(now + change, 1, cap);
    attributes[key] = next;
    deltas[key] = next - now;
  }

  return { attributes, deltas };
}

/** Rounds the working float attributes for display without letting rounding
 *  nudge anything past the ceiling. */
export function displayAttributes(attributes: Attributes, ceiling: Attributes): Attributes {
  const out = { ...attributes };
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = Math.min(Math.round(attributes[key]), Math.round(ceiling[key]));
  }
  return out;
}

/**
 * How close to the ceiling the player has got, 0-1. Drives the coach hints
 * during a run and the "what might have been" ending.
 */
export function realisation(attributes: Attributes, ceiling: Attributes, pos: PositionId): number {
  const weights = position(pos).weights;
  let got = 0;
  let possible = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 0;
    got += w * attributes[key];
    possible += w * ceiling[key];
  }
  return possible > 0 ? clamp(got / possible, 0, 1) : 0;
}

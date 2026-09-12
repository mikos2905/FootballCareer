import { position } from './positions';
import { clamp, Rng } from './rng';
import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, type PositionId } from './types';

/**
 * Development.
 *
 *   gap      = ceiling - current
 *   delta    = gap * ageMultiplier * minutesFactor * trainingFactor
 *              - injuryPenalty + noise
 *
 * Growth is asymptotic, so a player near their ceiling improves slowly however
 * well things go — that is what makes the hidden ceiling mean anything.
 *
 * Minutes gate development hard. A wonderkid who joins a giant at 18 and sits
 * on the bench visibly stalls. That trap is deliberate: it is the most
 * interesting decision in the game and the model has to make it real.
 */

/** Minutes a full season of first-team football looks like. */
export const FULL_SEASON_MINUTES = 3000;

/**
 * Most an attribute can gain in one season.
 *
 * Without this, a teenager with a big gap to a high ceiling closes a third of
 * it in one year and jumps seventeen OVR points between birthdays, which reads
 * as nonsense on a season table however well-calibrated the career totals are.
 */
function maxGainPerSeason(age: number): number {
  if (age <= 19) return 7;
  if (age <= 22) return 5.5;
  if (age <= 25) return 4;
  return 2.5;
}

/**
 * Age multiplier, expressed relative to the player's own peak age rather than a
 * fixed number — peak varies by position and by seed.
 */
export function ageMultiplier(age: number, peakAge: number): number {
  const distance = age - peakAge;
  if (distance <= 0) {
    // Rises steeply in the teens, tapering as the peak approaches.
    return clamp(0.075 + Math.pow(-distance / 11, 1.3) * 0.42, 0.03, 0.52);
  }
  // Past the peak there is nothing left to close; decline is handled separately.
  return clamp(0.07 * Math.exp(-distance / 2.2), 0, 0.07);
}

/**
 * Minutes gate growth. Below roughly a third of a season the player is training
 * rather than playing, and it shows.
 */
export function minutesFactorFor(minutes: number): number {
  const share = clamp(minutes / FULL_SEASON_MINUTES, 0, 1.15);
  // Steep at the bottom on purpose. A wonderkid who joins a giant at eighteen
  // and plays four hundred minutes a season develops at roughly a third of the
  // rate of one playing every week, and that has to be visible in the numbers
  // or the most interesting decision in the game has no teeth.
  return clamp(0.14 + Math.pow(share, 0.9) * 0.95, 0.14, 1.12);
}

interface DeclineProfile {
  /** Seasons past peak before this attribute starts falling. */
  offset: number;
  perSeason: number;
  /** Growth that continues past peak — experience attributes keep improving. */
  lateGrowth: number;
}

/**
 * Decline is attribute-specific, and this table is why a pacey winger and a
 * deep-lying playmaker age completely differently.
 */
const DECLINE: Record<AttributeKey, DeclineProfile> = {
  pace: { offset: 2, perSeason: 1.55, lateGrowth: 0 },
  physical: { offset: 3, perSeason: 1.15, lateGrowth: 0 },
  dribbling: { offset: 3, perSeason: 0.9, lateGrowth: 0 },
  shooting: { offset: 5, perSeason: 0.5, lateGrowth: 0.08 },
  defending: { offset: 5, perSeason: 0.45, lateGrowth: 0.15 },
  passing: { offset: 6, perSeason: 0.32, lateGrowth: 0.18 },
  flair: { offset: 6, perSeason: 0.3, lateGrowth: 0.14 },
  weakFoot: { offset: 7, perSeason: 0.22, lateGrowth: 0.08 },
};

export interface DevelopmentInputs {
  age: number;
  peakAge: number;
  minutes: number;
  /** League strength multiplier. Harder football develops players faster. */
  leagueStrength: number;
  matchesMissed: number;
  wear: number;
  /** Multiplier from training decisions. 1 = neutral. */
  trainingFactor: number;
  focus?: readonly AttributeKey[];
  /** Permanent damage from injury, applied to both value and ceiling. */
  permanent?: Partial<Attributes> | null;
}

export interface DevelopmentResult {
  attributes: Attributes;
  ceiling: Attributes;
  deltas: Record<AttributeKey, number>;
}

export function developAttributes(
  rng: Rng,
  current: Attributes,
  ceilingIn: Attributes,
  pos: PositionId,
  inputs: DevelopmentInputs,
): DevelopmentResult {
  const weights = position(pos).weights;
  const age = ageMultiplier(inputs.age, inputs.peakAge);
  const minutes = minutesFactorFor(inputs.minutes);
  // Harder football stretches a player. A season in a strong league is worth
  // more than the same minutes two divisions down.
  const leagueFactor = 0.82 + clamp(inputs.leagueStrength, 0.5, 1.05) * 0.36;
  const injuryPenalty = Math.pow(clamp(inputs.matchesMissed, 0, 46) / 46, 1.2) * 2.6;
  const focusSet = new Set(inputs.focus ?? []);

  const attributes = { ...current };
  const ceiling = { ...ceilingIn };
  const deltas = {} as Record<AttributeKey, number>;

  // Permanent injury damage lowers the ceiling too — you do not get that back.
  if (inputs.permanent) {
    for (const key of ATTRIBUTE_KEYS) {
      const hit = inputs.permanent[key];
      if (hit === undefined) continue;
      ceiling[key] = clamp(ceiling[key] + hit, 1, 99);
      attributes[key] = clamp(attributes[key] + hit, 1, ceiling[key]);
    }
  }

  const past = inputs.age - inputs.peakAge;

  for (const key of ATTRIBUTE_KEYS) {
    const cap = ceiling[key];
    const now = attributes[key];
    const gap = Math.max(0, cap - now);

    const relevance = clamp(0.78 + (weights[key] ?? 0) * 1.7, 0.82, 1.18);
    const focusBoost = focusSet.has(key) ? 1.5 : focusSet.size > 0 ? 0.82 : 1;
    const noise = rng.around(1, 0.16, 0.55, 1.45);

    let change = gap * age * minutes * leagueFactor * relevance * focusBoost * inputs.trainingFactor * noise;
    change = Math.min(change, maxGainPerSeason(inputs.age));
    change -= injuryPenalty * relevance * 0.4;

    const profile = DECLINE[key];
    const declineYears = past - profile.offset;
    if (declineYears > 0) {
      const wearFactor = 1 + inputs.wear / 130;
      change -=
        profile.perSeason * (1 + declineYears * 0.3) * wearFactor * rng.around(1, 0.2, 0.5, 1.5);
    } else if (past > 0) {
      // Between the peak and the onset of decline, the experience attributes
      // are still quietly improving.
      change += profile.lateGrowth * rng.around(1, 0.3, 0.2, 1.8);
    }

    const next = clamp(now + change, 1, cap);
    attributes[key] = next;
    deltas[key] = next - now;
  }

  return { attributes, ceiling, deltas };
}

/** Rounds working floats for display without letting rounding cross the ceiling. */
export function displayAttributes(attributes: Attributes, ceiling: Attributes): Attributes {
  const out = { ...attributes };
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = clamp(Math.min(Math.round(attributes[key]), Math.round(ceiling[key])), 1, 99);
  }
  return out;
}

/** How close to the ceiling the player got, 0-1, weighted by position. */
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

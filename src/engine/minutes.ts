import { position } from './positions';
import { clamp, Rng } from './rng';
import { ATTRIBUTE_KEYS, type Attributes, type PositionId, type SquadRole } from './types';

/**
 * Minutes are the spine of the simulation. Development, output, reputation,
 * market value and transfer interest all hang off them, so this model gets
 * resolved before anything else in a season.
 */

/** League matches in a season. Cup and continental fixtures are added on top. */
export const LEAGUE_MATCHES = 38;

/**
 * What the manager picks on, which is not OVR. Each position weights the
 * attributes a coach actually judges selection by — which is why a centre back
 * losing pace drops out of the side faster than a striker does.
 */
export function selectionRating(attributes: Attributes, pos: PositionId, suppression = 0): number {
  const weights = position(pos).selection;
  let total = 0;
  let weightSum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 0;
    if (w === 0) continue;
    total += w * Math.max(1, attributes[key] - suppression);
    weightSum += w;
  }
  return weightSum > 0 ? total / weightSum : 50;
}

/**
 * Age adjustment to squad standing, in strength points.
 *
 * A 17-year-old at parity with the squad plays markedly less than a
 * 27-year-old at parity: managers trust experience, and a teenager is a risk
 * even when he is good enough.
 */
export function ageStandingAdjustment(age: number): number {
  const table: Record<number, number> = {
    16: -15,
    17: -11.5,
    18: -8.5,
    19: -6,
    20: -4,
    21: -2.5,
    22: -1.5,
    23: -0.7,
  };
  if (age <= 23) return table[age] ?? -15;
  if (age <= 30) return 0;
  // Managers start looking for a younger option well before a player is finished.
  return -Math.pow(age - 30, 1.55) * 0.85;
}

export interface MinutesInputs {
  attributes: Attributes;
  position: PositionId;
  age: number;
  squadStrength: number;
  managerRelationship: number;
  form: number;
  suppression: number;
  /** Matches unavailable through injury. */
  matchesMissed: number;
  /** Total fixtures the club plays this season. */
  totalMatches: number;
  /** Multiplier from decisions. */
  minutesFactor: number;
}

export interface MinutesResult {
  role: SquadRole;
  standing: number;
  /** Share of available minutes before injury is taken off. */
  intendedShare: number;
  starts: number;
  substituteAppearances: number;
  appearances: number;
  minutes: number;
  /** Set when something outside the player's control moved their season. */
  swing: 'opportunity' | 'frozen-out' | null;
}

export function squadStanding(inputs: MinutesInputs): number {
  const rating = selectionRating(inputs.attributes, inputs.position, inputs.suppression);
  return (
    rating -
    inputs.squadStrength +
    ageStandingAdjustment(inputs.age) +
    (inputs.managerRelationship / 100) * 5 +
    (inputs.form / 20) * 2.5
  );
}

/**
 * Standing to expected share of available minutes.
 *
 * Calibrated against the brief: well above squad level is nailed on (~0.90), at
 * parity you rotate with a lean toward starting (~0.57), a few points below and
 * you are a squad option (~0.29), well below and you barely feature (~0.08).
 */
export function shareForStanding(standing: number, keeper = false): number {
  // Goalkeeping is a more binary job — you are first choice or you are the cup
  // keeper — so the curve is steeper, but it is steeper in selection, not in
  // how starts follow from it. Putting the sharpness in an exponent instead
  // made a two-point swing in standing move a keeper from 18 starts to 5.
  return 1 / (1 + Math.exp(-(standing + 1.2) / (keeper ? 3.4 : 4.2)));
}

export function simulateMinutes(rng: Rng, inputs: MinutesInputs): MinutesResult {
  const keeper = inputs.position === 'GK';
  const standing = squadStanding(inputs);
  let share = shareForStanding(standing, keeper);

  // The unexpected: the player ahead of you does a hamstring in August, or a new
  // manager arrives in October and does not fancy you.
  let swing: MinutesResult['swing'] = null;
  if (rng.chance(0.1)) {
    share = clamp(share * 1.4 + 0.06, 0, 1);
    swing = 'opportunity';
  } else if (rng.chance(0.085)) {
    share = clamp(share * 0.5, 0, 1);
    swing = 'frozen-out';
  }

  share = clamp(rng.around(share, 0.085, 0, 1) * inputs.minutesFactor, 0, 1);

  const available = Math.max(0, inputs.totalMatches - inputs.matchesMissed);

  // A keeper plays the whole match or none of it, so his starts track his share
  // of minutes directly.
  const startFraction = keeper ? share : Math.pow(share, 1.35);
  const starts = Math.round(clamp(available * startFraction, 0, available));

  // Outfield starters get substituted, rested and suspended: nobody averages ninety.
  const perStart = keeper ? 90 : rng.around(78, 4, 55, 90);
  const startMinutes = starts * perStart;
  const targetMinutes = inputs.totalMatches * 90 * share * (available / Math.max(1, inputs.totalMatches));
  const residual = Math.max(0, targetMinutes - startMinutes);
  const perSub = keeper ? 45 : rng.around(22, 5, 8, 40);
  // A player out of favour is left out of the squad, not brought on every week.
  // Without this cap, residual minutes turn a frozen-out forward into someone
  // who appeared in all forty-two matches.
  const appearanceCap = Math.round(available * clamp(0.3 + share * 0.8, 0, 1));
  const substituteAppearances = keeper
    ? 0
    : Math.round(clamp(residual / perSub, 0, Math.max(0, Math.min(available, appearanceCap) - starts)));

  const minutes = Math.round(
    clamp(startMinutes + substituteAppearances * perSub, 0, available * 90 * 0.94),
  );

  return {
    role: roleFor(share, standing),
    standing,
    intendedShare: share,
    starts,
    substituteAppearances,
    appearances: starts + substituteAppearances,
    minutes,
    swing,
  };
}

export function roleFor(share: number, standing: number): SquadRole {
  if (share >= 0.78 && standing >= 5) return 'star';
  if (share >= 0.58) return 'starter';
  if (share >= 0.36) return 'rotation';
  if (share >= 0.16) return 'squad';
  return 'fringe';
}

export const ROLE_LABELS: Record<SquadRole, string> = {
  star: 'Star player',
  starter: 'Regular starter',
  rotation: 'Rotation',
  squad: 'Squad player',
  fringe: 'Fringe',
};

/** Fixtures a club plays, given its cup and continental involvement. */
export function totalMatchesFor(inContinental: boolean, cupCount: number): number {
  return LEAGUE_MATCHES + cupCount * 2 + (inContinental ? 8 : 0);
}

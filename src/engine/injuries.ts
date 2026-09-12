import { clamp, Rng } from './rng';
import type { Attributes, Injury, InjurySeverity, PositionId } from './types';

/**
 * Injuries.
 *
 * A per-season hazard from physical attribute, accumulated wear, age and any
 * decision to play through a knock. Occurrence is drawn first, then severity
 * from a distribution weighted heavily toward the minor.
 *
 * The tail matters more than the middle: a severe injury carries a small chance
 * of permanent damage to pace or physical. It is rare, but it has to exist,
 * because the possibility is the entire weight behind "rest, or play the derby".
 */

interface SeverityProfile {
  severity: InjurySeverity;
  weight: number;
  labels: readonly string[];
  matches: [number, number];
  /** Attribute points suppressed for the rest of the season. */
  suppression: [number, number];
  /** Chance this injury leaves permanent damage. */
  permanentChance: number;
  /** Chance this injury ends the career outright. */
  careerEndingChance: number;
  wear: number;
}

const SEVERITIES: readonly SeverityProfile[] = [
  {
    severity: 'knock',
    weight: 42,
    labels: ['Dead leg', 'Bruised ribs', 'Rolled ankle', 'Tight calf'],
    matches: [1, 3],
    suppression: [0, 1],
    permanentChance: 0,
    careerEndingChance: 0,
    wear: 1,
  },
  {
    severity: 'minor',
    weight: 30,
    labels: ['Hamstring strain', 'Groin strain', 'Ankle sprain', 'Back spasm'],
    matches: [3, 7],
    suppression: [1, 2],
    permanentChance: 0,
    careerEndingChance: 0,
    wear: 2.5,
  },
  {
    severity: 'moderate',
    weight: 18,
    labels: ['Torn hamstring', 'Medial ligament damage', 'Broken metatarsal', 'Hernia'],
    matches: [8, 16],
    suppression: [2, 4],
    permanentChance: 0.02,
    careerEndingChance: 0,
    wear: 5,
  },
  {
    severity: 'serious',
    weight: 5,
    labels: ['Ruptured ankle ligaments', 'Broken leg', 'Cruciate damage', 'Stress fracture'],
    matches: [17, 30],
    suppression: [4, 7],
    permanentChance: 0.06,
    careerEndingChance: 0.025,
    wear: 9,
  },
  {
    severity: 'severe',
    weight: 1,
    labels: ['Ruptured cruciate', 'Shattered ankle', 'Achilles rupture'],
    matches: [30, 46],
    suppression: [6, 11],
    permanentChance: 0.4,
    careerEndingChance: 0.1,
    wear: 15,
  },
] as const;

export interface InjuryInputs {
  attributes: Attributes;
  position: PositionId;
  age: number;
  injuryProneness: number;
  wear: number;
  /** Fixtures the club will play. More football, more exposure. */
  totalMatches: number;
  /** Share of available minutes the player is expected to take. */
  intendedShare: number;
  /** Multiplier from decisions — playing through a knock raises this. */
  riskFactor: number;
}

/** Expected number of injuries in a season. */
export function injuryHazard(inputs: InjuryInputs): number {
  const robustness = clamp(inputs.attributes.physical, 1, 99);
  const base =
    0.26 +
    (inputs.injuryProneness / 100) * 0.6 +
    (inputs.wear / 100) * 0.5 +
    Math.max(0, inputs.age - 29) * 0.045 -
    ((robustness - 55) / 100) * 0.35;
  const exposure = 0.35 + inputs.intendedShare * 0.95 * (inputs.totalMatches / 46);
  return Math.max(0.02, base * exposure * inputs.riskFactor);
}

export interface InjurySeasonResult {
  injuries: Injury[];
  matchesMissed: number;
  /** Attribute suppression to carry into this season's performance. */
  suppression: number;
  wearAdded: number;
  permanent: Partial<Attributes> | null;
  careerEnding: boolean;
}

export function simulateInjuries(
  rng: Rng,
  inputs: InjuryInputs,
  season: number,
  /** Set by the scripted injury window: something happens this year regardless of luck. */
  forceAtLeastOne = false,
): InjurySeasonResult {
  const hazard = injuryHazard(inputs);
  // How many separate problems, not whether he was injured at all.
  const count = Math.max(drawInjuryCount(rng, hazard), forceAtLeastOne ? 1 : 0);

  const injuries: Injury[] = [];
  let matchesMissed = 0;
  let suppression = 0;
  let wearAdded = 0;
  let permanent: Partial<Attributes> | null = null;
  let careerEnding = false;

  for (let i = 0; i < count; i += 1) {
    const profile = rng.weighted(SEVERITIES, (s) => s.weight);
    const missed = rng.int(profile.matches[0], profile.matches[1]);
    const supp = rng.int(profile.suppression[0], profile.suppression[1]);

    let permanentHit: Partial<Attributes> | null = null;
    if (profile.permanentChance > 0 && rng.chance(profile.permanentChance)) {
      // Permanent damage lands on the athletic attributes, never on the ones a
      // player keeps into their thirties anyway.
      const target = rng.chance(0.6) ? 'pace' : 'physical';
      const amount = rng.int(1, profile.severity === 'severe' ? 6 : 3);
      permanentHit = { [target]: -amount } as Partial<Attributes>;
      permanent = mergePermanent(permanent, permanentHit);
    }

    const ends = profile.careerEndingChance > 0 && rng.chance(profile.careerEndingChance);
    if (ends) careerEnding = true;

    injuries.push({
      season,
      age: inputs.age,
      severity: profile.severity,
      label: rng.pick(profile.labels),
      matchesMissed: missed,
      suppression: supp,
      permanent: permanentHit,
      careerEnding: ends,
    });

    matchesMissed += missed;
    suppression = Math.max(suppression, supp);
    wearAdded += profile.wear;
  }

  return {
    injuries,
    matchesMissed: Math.min(matchesMissed, inputs.totalMatches),
    suppression,
    wearAdded,
    permanent,
    careerEnding,
  };
}

/** Poisson-ish count, capped — three separate injuries in a season is already a wretched year. */
function drawInjuryCount(rng: Rng, hazard: number): number {
  let count = 0;
  let remaining = hazard;
  for (let i = 0; i < 4; i += 1) {
    const p = 1 - Math.exp(-Math.min(remaining, 1.2));
    if (!rng.chance(p)) break;
    count += 1;
    remaining -= 1;
    if (remaining <= 0) break;
  }
  return count;
}

function mergePermanent(
  existing: Partial<Attributes> | null,
  addition: Partial<Attributes>,
): Partial<Attributes> {
  const out: Partial<Attributes> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(addition) as [keyof Attributes, number][]) {
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

/**
 * An injury that changed the shape of a career: it ended the career, or it took
 * something away that never came back. A long layoff he fully recovers from is
 * a ruined season, not a career-altering event — `isLongLayoff` covers that.
 */
export function isCareerAltering(injury: Injury): boolean {
  return injury.careerEnding || injury.permanent !== null;
}

/** Out for most of a season, but no lasting damage. */
export function isLongLayoff(injury: Injury): boolean {
  return injury.matchesMissed >= 24;
}

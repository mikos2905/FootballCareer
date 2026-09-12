import { position } from './positions';
import { clamp, overdispersed, Rng } from './rng';
import { ATTRIBUTE_KEYS, type Attributes, type KeeperRecord, type PositionId } from './types';

/**
 * What a player actually produced, given minutes.
 *
 * Expectations are computed from state, then drawn from an overdispersed count
 * distribution. A plain Poisson draw is far too tight — football has hot and
 * cold seasons well outside Poisson variance, and under Poisson every season
 * on the table looks the same.
 */

/**
 * Variance as a multiple of the mean. Poisson is 1. Goals run hotter and colder
 * than assists, which are spread over more of the season.
 */
const GOALS_VARIANCE_RATIO = 1.9;
const ASSISTS_VARIANCE_RATIO = 1.7;

/**
 * Hard ceiling on an expectation, as a multiple of the position baseline. The
 * modifiers are multiplicative, so an elite finisher at a dominant club in a
 * weak league compounds three strong terms at once; without this, that case
 * produces fifty-goal expectations.
 */
const EXPECTATION_CAP = 1.45;

/**
 * Club strength and OVR share the 1-99 scale: a club of strength 78 is one
 * where a 78-OVR player is a regular. Keeping these on one scale is what makes
 * the squad-standing and transfer-band comparisons mean anything.
 */
export function ovrForStrength(strength: number): number {
  return strength;
}

/**
 * Non-linear. The gap between 85 and 95 finishing matters considerably more
 * than the gap between 55 and 65 — elite finishing is a different thing, not
 * more of the same thing.
 */
export function finishingModifier(attributes: Attributes): number {
  const input = 0.75 * attributes.shooting + 0.15 * attributes.flair + 0.1 * attributes.dribbling;
  return Math.pow(input / 72, 1.75);
}

export function creatingModifier(attributes: Attributes): number {
  const input = 0.55 * attributes.passing + 0.28 * attributes.flair + 0.17 * attributes.dribbling;
  return Math.pow(input / 72, 1.65);
}

/** How much better than their own league the club is. Drives chances created. */
export function teamAttackModifier(
  clubStrength: number,
  leagueAverageStrength: number,
  sensitivity: number,
): number {
  return clamp(1 + ((clubStrength - leagueAverageStrength) / 100) * sensitivity * 1.8, 0.55, 1.35);
}

/**
 * Harder leagues suppress output. A striker who scores twenty in the third tier
 * does not score twenty in the Premier League, and this is the term that says so.
 */
export function leagueDifficultyModifier(leagueStrength: number): number {
  return clamp(Math.pow(0.95 / clamp(leagueStrength, 0.4, 1.05), 0.75), 0.82, 1.18);
}

export interface OutputInputs {
  attributes: Attributes;
  position: PositionId;
  minutes: number;
  clubStrength: number;
  leagueAverageStrength: number;
  leagueStrength: number;
  form: number;
  ovr: number;
}

export interface OutputResult {
  goals: number;
  assists: number;
  averageRating: number;
  expectedGoals: number;
  expectedAssists: number;
  /** Contribution relative to what the position and club would expect, -1..+1ish. */
  contributionIndex: number;
}

export function simulateOutput(rng: Rng, inputs: OutputInputs): OutputResult {
  const pos = position(inputs.position);
  const ninetys = inputs.minutes / 90;
  const formFactor = 1 + inputs.form / 120;
  const team = teamAttackModifier(inputs.clubStrength, inputs.leagueAverageStrength, pos.teamAttackSensitivity);
  const difficulty = leagueDifficultyModifier(inputs.leagueStrength);

  const goalsPer90 = Math.min(
    pos.goalsPer90 * finishingModifier(inputs.attributes) * team * difficulty * formFactor,
    pos.goalsPer90 * EXPECTATION_CAP,
  );
  const assistsPer90 = Math.min(
    pos.assistsPer90 * creatingModifier(inputs.attributes) * team * difficulty * formFactor,
    pos.assistsPer90 * EXPECTATION_CAP,
  );
  const expectedGoals = goalsPer90 * ninetys;
  const expectedAssists = assistsPer90 * ninetys;

  // The gamma-Poisson tail is heavy, and at four sigma it produces rates no
  // footballer has ever sustained. Cap the draw at an absolute rate rather than
  // a multiple of the expectation: a cameo hat-trick stays possible, twenty in
  // ten games does not.
  const goals = Math.min(overdispersed(rng, expectedGoals, GOALS_VARIANCE_RATIO), Math.floor(ninetys * 1.5) + 3);
  const assists = Math.min(
    overdispersed(rng, expectedAssists, ASSISTS_VARIANCE_RATIO),
    Math.floor(ninetys * 1.1) + 3,
  );

  const averageRating = drawRating(rng, {
    minutes: inputs.minutes,
    goals,
    assists,
    pos: inputs.position,
    ovr: inputs.ovr,
    leagueOvr: ovrForStrength(inputs.leagueAverageStrength),
  });

  const contributionIndex =
    ninetys > 0
      ? (goals / ninetys - pos.goalsPer90) * 1.0 + (assists / ninetys - pos.assistsPer90) * 0.7
      : 0;

  return { goals, assists, averageRating, expectedGoals, expectedAssists, contributionIndex };
}

function drawRating(
  rng: Rng,
  args: { minutes: number; goals: number; assists: number; pos: PositionId; ovr: number; leagueOvr: number },
): number {
  if (args.minutes < 270) return 0;
  const pos = position(args.pos);
  const ninetys = args.minutes / 90;
  const index =
    6.32 +
    (args.goals / ninetys - pos.goalsPer90) * 1.55 +
    (args.assists / ninetys - pos.assistsPer90) * 1.05 +
    (args.ovr - args.leagueOvr) * 0.021;
  return Math.round(clamp(rng.around(index, 0.2, 5, 9), 5, 9) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Goalkeepers
// ---------------------------------------------------------------------------

/**
 * Goalkeepers get their own model. Goals and assists are meaningless for them,
 * so the season reads as clean sheets, goals conceded and save percentage.
 *
 * The eight attributes map imperfectly onto goalkeeping, so this is the
 * mapping: `defending` stands in for shot-stopping, `physical` for command of
 * the area and reach, `flair` for reflexes and sweeping, `passing` for
 * distribution.
 */
export function keeperRating(attributes: Attributes): number {
  return 0.5 * attributes.defending + 0.25 * attributes.physical + 0.25 * attributes.flair;
}

export interface KeeperInputs {
  attributes: Attributes;
  minutes: number;
  starts: number;
  clubStrength: number;
  leagueAverageStrength: number;
  leagueStrength: number;
  form: number;
  ovr: number;
}

export interface KeeperResult {
  keeper: KeeperRecord;
  averageRating: number;
  contributionIndex: number;
}

export function simulateKeeper(rng: Rng, inputs: KeeperInputs): KeeperResult {
  const ninetys = inputs.minutes / 90;
  if (ninetys <= 0) {
    return {
      keeper: { cleanSheets: 0, goalsConceded: 0, saves: 0, shotsFaced: 0, savePercentage: 0 },
      averageRating: 0,
      contributionIndex: 0,
    };
  }

  // A better side in front of you faces fewer shots. That is most of a
  // goalkeeper's clean sheet record, and the model should admit it.
  const edge = inputs.clubStrength - inputs.leagueAverageStrength;
  const shotsPer90 = clamp(rng.around(4.5 - edge * 0.042, 0.45, 1.8, 8), 1.8, 8);
  const shotsFaced = Math.round(shotsPer90 * ninetys);

  const quality = keeperRating(inputs.attributes);
  // League difficulty here means better shots, not more of them.
  const difficultyDrag = (inputs.leagueStrength - 0.8) * 0.06;
  const expectedSavePct = clamp(
    0.6 + ((quality - 40) / 60) * 0.18 + inputs.form / 900 - difficultyDrag,
    0.5,
    0.84,
  );
  const savePercentage = clamp(rng.around(expectedSavePct, 0.022, 0.42, 0.88), 0.42, 0.88);

  const saves = Math.round(shotsFaced * savePercentage);
  const goalsConceded = Math.max(0, shotsFaced - saves);

  // Clean sheets: a Poisson zero per start, at this season's concession rate.
  const concededPer90 = goalsConceded / ninetys;
  const perMatch = Math.exp(-concededPer90);
  let cleanSheets = 0;
  for (let i = 0; i < inputs.starts; i += 1) {
    if (rng.chance(perMatch)) cleanSheets += 1;
  }

  const csRate = inputs.starts > 0 ? cleanSheets / inputs.starts : 0;
  const index =
    6.35 + (savePercentage - expectedSavePct) * 9 + (csRate - 0.3) * 1.5 + (inputs.ovr - ovrForStrength(inputs.leagueAverageStrength)) * 0.018;
  const averageRating = inputs.minutes < 270 ? 0 : Math.round(clamp(rng.around(index, 0.18, 5, 9), 5, 9) * 10) / 10;

  return {
    keeper: {
      cleanSheets,
      goalsConceded,
      saves,
      shotsFaced,
      savePercentage: Math.round(savePercentage * 1000) / 1000,
    },
    averageRating,
    contributionIndex: (savePercentage - expectedSavePct) * 6 + (csRate - 0.3) * 0.8,
  };
}

/** Guard against an attribute set that has drifted outside 1-99. */
export function assertAttributeRange(attributes: Attributes, where: string): void {
  for (const key of ATTRIBUTE_KEYS) {
    const v = attributes[key];
    if (!Number.isFinite(v) || v < 1 || v > 99) {
      throw new Error(`${where}: attribute ${key} out of range (${v})`);
    }
  }
}

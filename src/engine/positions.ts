import type { Attributes, PositionId } from './types';

export interface PositionDef {
  id: PositionId;
  name: string;
  short: string;
  line: 'goalkeeper' | 'defence' | 'midfield' | 'attack';
  /** Position on the pitch diagram, 0-100. x = left to right, y = own goal to opponent goal. */
  pitch: { x: number; y: number };
  /** OVR weights. Sum to 1. */
  weights: Attributes;
  /**
   * What a manager actually picks on, which is not the same as OVR. A centre
   * back who loses pace loses their place faster than a striker does, and this
   * is where that lives.
   */
  selection: Attributes;
  /** Goals per 90 at league-average quality. */
  goalsPer90: number;
  /** Assists per 90 at league-average quality. Wingers and tens peak here, not strikers. */
  assistsPer90: number;
  /** How hard the club's attacking strength moves this position's output. */
  teamAttackSensitivity: number;
  /** Base peak age. Jittered by seed at creation, within a few years either side. */
  peakAge: number;
}

const attrs = (
  pace: number,
  shooting: number,
  passing: number,
  dribbling: number,
  defending: number,
  physical: number,
  flair: number,
  weakFoot: number,
): Attributes => ({ pace, shooting, passing, dribbling, defending, physical, flair, weakFoot });

/**
 * Twelve positions. The enganche is the wildcard: a pure creator with almost no
 * pace or physical presence, who ages far better than a winger because nothing
 * he does depends on running.
 */
export const POSITIONS: readonly PositionDef[] = [
  {
    id: 'GK',
    name: 'Goalkeeper',
    short: 'GK',
    line: 'goalkeeper',
    pitch: { x: 50, y: 6 },
    //            pac  sho  pas  dri  def  phy  fla  wkf
    weights: attrs(0.04, 0.0, 0.14, 0.02, 0.4, 0.24, 0.12, 0.04),
    selection: attrs(0.04, 0.0, 0.14, 0.0, 0.45, 0.25, 0.12, 0.0),
    goalsPer90: 0,
    assistsPer90: 0.005,
    teamAttackSensitivity: 0,
    peakAge: 30,
  },
  {
    id: 'RB',
    name: 'Right Back',
    short: 'RB',
    line: 'defence',
    pitch: { x: 86, y: 26 },
    weights: attrs(0.22, 0.03, 0.16, 0.1, 0.24, 0.14, 0.06, 0.05),
    selection: attrs(0.26, 0.0, 0.16, 0.1, 0.24, 0.16, 0.04, 0.04),
    goalsPer90: 0.04,
    assistsPer90: 0.13,
    teamAttackSensitivity: 0.5,
    peakAge: 27,
  },
  {
    id: 'LB',
    name: 'Left Back',
    short: 'LB',
    line: 'defence',
    pitch: { x: 14, y: 26 },
    weights: attrs(0.22, 0.03, 0.16, 0.1, 0.24, 0.14, 0.06, 0.05),
    selection: attrs(0.26, 0.0, 0.16, 0.1, 0.24, 0.16, 0.04, 0.04),
    goalsPer90: 0.04,
    assistsPer90: 0.13,
    teamAttackSensitivity: 0.5,
    peakAge: 27,
  },
  {
    id: 'CB',
    name: 'Centre Back',
    short: 'CB',
    line: 'defence',
    pitch: { x: 50, y: 22 },
    weights: attrs(0.13, 0.02, 0.11, 0.03, 0.38, 0.26, 0.02, 0.05),
    selection: attrs(0.22, 0.0, 0.12, 0.03, 0.34, 0.26, 0.0, 0.03),
    goalsPer90: 0.05,
    assistsPer90: 0.03,
    teamAttackSensitivity: 0.3,
    peakAge: 29,
  },
  {
    id: 'DM',
    name: 'Defensive Midfield',
    short: 'DM',
    line: 'midfield',
    pitch: { x: 50, y: 40 },
    weights: attrs(0.07, 0.06, 0.21, 0.07, 0.28, 0.21, 0.04, 0.06),
    selection: attrs(0.12, 0.0, 0.24, 0.06, 0.3, 0.24, 0.04, 0.0),
    goalsPer90: 0.04,
    assistsPer90: 0.08,
    teamAttackSensitivity: 0.4,
    peakAge: 28,
  },
  {
    id: 'CM',
    name: 'Centre Midfield',
    short: 'CM',
    line: 'midfield',
    pitch: { x: 50, y: 54 },
    weights: attrs(0.09, 0.08, 0.26, 0.13, 0.13, 0.15, 0.1, 0.06),
    selection: attrs(0.14, 0.0, 0.26, 0.14, 0.16, 0.18, 0.12, 0.0),
    goalsPer90: 0.09,
    assistsPer90: 0.16,
    teamAttackSensitivity: 0.65,
    peakAge: 28,
  },
  {
    id: 'AM',
    name: 'Attacking Midfield',
    short: 'AM',
    line: 'midfield',
    pitch: { x: 50, y: 68 },
    weights: attrs(0.1, 0.15, 0.24, 0.18, 0.03, 0.05, 0.18, 0.07),
    selection: attrs(0.14, 0.18, 0.22, 0.2, 0.0, 0.06, 0.2, 0.0),
    goalsPer90: 0.18,
    assistsPer90: 0.26,
    teamAttackSensitivity: 0.95,
    peakAge: 27,
  },
  {
    id: 'ENG',
    name: 'Enganche',
    short: 'ENG',
    line: 'midfield',
    pitch: { x: 34, y: 64 },
    weights: attrs(0.03, 0.1, 0.3, 0.16, 0.02, 0.04, 0.26, 0.09),
    selection: attrs(0.02, 0.12, 0.34, 0.18, 0.0, 0.04, 0.3, 0.0),
    goalsPer90: 0.14,
    assistsPer90: 0.28,
    teamAttackSensitivity: 1.0,
    // Nothing he does depends on running, so he lasts.
    peakAge: 29,
  },
  {
    id: 'RW',
    name: 'Right Wing',
    short: 'RW',
    line: 'attack',
    pitch: { x: 84, y: 78 },
    weights: attrs(0.22, 0.15, 0.13, 0.22, 0.02, 0.05, 0.15, 0.06),
    selection: attrs(0.28, 0.16, 0.12, 0.24, 0.0, 0.04, 0.16, 0.0),
    goalsPer90: 0.24,
    assistsPer90: 0.24,
    teamAttackSensitivity: 1.0,
    peakAge: 27,
  },
  {
    id: 'LW',
    name: 'Left Wing',
    short: 'LW',
    line: 'attack',
    pitch: { x: 16, y: 78 },
    weights: attrs(0.22, 0.15, 0.13, 0.22, 0.02, 0.05, 0.15, 0.06),
    selection: attrs(0.28, 0.16, 0.12, 0.24, 0.0, 0.04, 0.16, 0.0),
    goalsPer90: 0.24,
    assistsPer90: 0.24,
    teamAttackSensitivity: 1.0,
    peakAge: 27,
  },
  {
    id: 'SS',
    name: 'Second Striker',
    short: 'SS',
    line: 'attack',
    pitch: { x: 62, y: 84 },
    weights: attrs(0.14, 0.24, 0.13, 0.18, 0.02, 0.07, 0.16, 0.06),
    selection: attrs(0.18, 0.28, 0.12, 0.2, 0.0, 0.06, 0.16, 0.0),
    goalsPer90: 0.32,
    assistsPer90: 0.18,
    teamAttackSensitivity: 1.05,
    peakAge: 27,
  },
  {
    id: 'ST',
    name: 'Striker',
    short: 'ST',
    line: 'attack',
    pitch: { x: 40, y: 90 },
    weights: attrs(0.18, 0.3, 0.07, 0.12, 0.03, 0.15, 0.08, 0.07),
    selection: attrs(0.18, 0.34, 0.08, 0.14, 0.0, 0.18, 0.08, 0.0),
    goalsPer90: 0.52,
    assistsPer90: 0.12,
    teamAttackSensitivity: 1.1,
    peakAge: 27,
  },
] as const;

/**
 * How concentrated a position's OVR weights are: sum of squared weights, minus
 * the value for a perfectly flat weighting.
 *
 * A goalkeeper's rating leans on two attributes; a winger's is spread over five.
 * Anything that shapes attributes around the positional weights therefore has a
 * much larger effect on OVR for a concentrated position than a spread one, and
 * has to be normalised by this or goalkeepers come out systematically stronger
 * than wingers for no reason anyone intended.
 */
export function weightConcentration(id: PositionId): number {
  const weights = position(id).weights;
  let sum = 0;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    sum += (weights[key] ?? 0) ** 2;
  }
  return Math.max(sum - 1 / 8, 0.005);
}

const BY_ID = new Map<PositionId, PositionDef>(POSITIONS.map((p) => [p.id, p]));

export function position(id: PositionId): PositionDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown position: ${id}`);
  return def;
}

export const POSITION_IDS: readonly PositionId[] = POSITIONS.map((p) => p.id);
export const OUTFIELD_POSITION_IDS: readonly PositionId[] = POSITIONS.filter((p) => p.id !== 'GK').map((p) => p.id);

export function isGoalkeeper(id: PositionId): boolean {
  return id === 'GK';
}

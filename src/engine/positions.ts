import type { AttributeKey, Attributes, PositionId } from './types';

export interface PositionDef {
  id: PositionId;
  name: string;
  /** Grouping used for pitch layout and for "can this player switch position". */
  line: 'goalkeeper' | 'defence' | 'midfield' | 'attack';
  /** Position on the pitch diagram, 0-100. x = left to right, y = own goal to opponent goal. */
  pitch: { x: number; y: number };
  /** OVR weights. Must sum to 1. */
  weights: Attributes;
  /** Goals per 90 for a reference player (70 in the relevant attributes) at a
   *  mid-table top-flight club. Everything else scales off this. */
  goalRate: number;
  /** Assists per 90 on the same reference basis. */
  assistRate: number;
  /** How strongly the club's attacking strength moves this position's output. */
  teamAttackSensitivity: number;
  /** Which attribute most drives goalscoring for this position. */
  scoringDriver: AttributeKey;
}

const w = (
  pace: number,
  shooting: number,
  passing: number,
  dribbling: number,
  defending: number,
  physical: number,
  flair: number,
  weakFoot: number,
): Attributes => ({ pace, shooting, passing, dribbling, defending, physical, flair, weakFoot });

export const POSITIONS: readonly PositionDef[] = [
  {
    id: 'GK',
    name: 'Goalkeeper',
    line: 'goalkeeper',
    pitch: { x: 50, y: 6 },
    weights: w(0.06, 0.0, 0.14, 0.03, 0.38, 0.22, 0.12, 0.05),
    goalRate: 0.0004,
    assistRate: 0.004,
    teamAttackSensitivity: 0.05,
    scoringDriver: 'shooting',
  },
  {
    id: 'LB',
    name: 'Left Back',
    line: 'defence',
    pitch: { x: 14, y: 26 },
    weights: w(0.22, 0.03, 0.16, 0.1, 0.25, 0.14, 0.05, 0.05),
    goalRate: 0.04,
    assistRate: 0.13,
    teamAttackSensitivity: 0.5,
    scoringDriver: 'shooting',
  },
  {
    id: 'CB',
    name: 'Centre Back',
    line: 'defence',
    pitch: { x: 50, y: 22 },
    weights: w(0.12, 0.02, 0.12, 0.03, 0.38, 0.26, 0.02, 0.05),
    goalRate: 0.06,
    assistRate: 0.03,
    teamAttackSensitivity: 0.35,
    scoringDriver: 'physical',
  },
  {
    id: 'RB',
    name: 'Right Back',
    line: 'defence',
    pitch: { x: 86, y: 26 },
    weights: w(0.22, 0.03, 0.16, 0.1, 0.25, 0.14, 0.05, 0.05),
    goalRate: 0.04,
    assistRate: 0.13,
    teamAttackSensitivity: 0.5,
    scoringDriver: 'shooting',
  },
  {
    id: 'CDM',
    name: 'Defensive Midfield',
    line: 'midfield',
    pitch: { x: 50, y: 40 },
    weights: w(0.07, 0.05, 0.2, 0.07, 0.28, 0.22, 0.04, 0.07),
    goalRate: 0.05,
    assistRate: 0.09,
    teamAttackSensitivity: 0.45,
    scoringDriver: 'shooting',
  },
  {
    id: 'LM',
    name: 'Left Midfield',
    line: 'midfield',
    pitch: { x: 14, y: 52 },
    weights: w(0.2, 0.09, 0.18, 0.18, 0.08, 0.1, 0.12, 0.05),
    goalRate: 0.17,
    assistRate: 0.22,
    teamAttackSensitivity: 0.8,
    scoringDriver: 'shooting',
  },
  {
    id: 'CM',
    name: 'Centre Midfield',
    line: 'midfield',
    pitch: { x: 50, y: 54 },
    weights: w(0.09, 0.08, 0.26, 0.13, 0.13, 0.15, 0.1, 0.06),
    goalRate: 0.12,
    assistRate: 0.18,
    teamAttackSensitivity: 0.7,
    scoringDriver: 'shooting',
  },
  {
    id: 'RM',
    name: 'Right Midfield',
    line: 'midfield',
    pitch: { x: 86, y: 52 },
    weights: w(0.2, 0.09, 0.18, 0.18, 0.08, 0.1, 0.12, 0.05),
    goalRate: 0.17,
    assistRate: 0.22,
    teamAttackSensitivity: 0.8,
    scoringDriver: 'shooting',
  },
  {
    id: 'CAM',
    name: 'Attacking Midfield',
    line: 'midfield',
    pitch: { x: 50, y: 68 },
    weights: w(0.1, 0.15, 0.24, 0.18, 0.03, 0.05, 0.18, 0.07),
    goalRate: 0.24,
    assistRate: 0.28,
    teamAttackSensitivity: 0.95,
    scoringDriver: 'shooting',
  },
  {
    id: 'LW',
    name: 'Left Wing',
    line: 'attack',
    pitch: { x: 16, y: 80 },
    weights: w(0.22, 0.15, 0.13, 0.22, 0.02, 0.05, 0.15, 0.06),
    goalRate: 0.31,
    assistRate: 0.24,
    teamAttackSensitivity: 1.0,
    scoringDriver: 'shooting',
  },
  {
    id: 'RW',
    name: 'Right Wing',
    line: 'attack',
    pitch: { x: 84, y: 80 },
    weights: w(0.22, 0.15, 0.13, 0.22, 0.02, 0.05, 0.15, 0.06),
    goalRate: 0.31,
    assistRate: 0.24,
    teamAttackSensitivity: 1.0,
    scoringDriver: 'shooting',
  },
  {
    id: 'ST',
    name: 'Striker',
    line: 'attack',
    pitch: { x: 50, y: 88 },
    weights: w(0.18, 0.3, 0.08, 0.12, 0.03, 0.14, 0.08, 0.07),
    goalRate: 0.52,
    assistRate: 0.15,
    teamAttackSensitivity: 1.1,
    scoringDriver: 'shooting',
  },
] as const;

const BY_ID = new Map<PositionId, PositionDef>(POSITIONS.map((p) => [p.id, p]));

export function position(id: PositionId): PositionDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown position: ${id}`);
  return def;
}

export const POSITION_IDS: readonly PositionId[] = POSITIONS.map((p) => p.id);

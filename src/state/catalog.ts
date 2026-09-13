import { ARCHETYPES } from '../engine/archetypes';
import { POSITIONS } from '../engine/positions';
import { WORLD_DATA } from '../data';
import { ATTRIBUTE_KEYS, type AttributeKey, type Cadence, type PositionId } from '../engine/types';

/**
 * Everything the UI needs to render, in UI shapes.
 *
 * Components import from `src/state` and never from `src/engine`, so that no
 * component can reach a tunable, an OVR calculation or an outcome. This module
 * is the only place the two meet, and it does nothing but reshape data.
 */

export interface PositionOption {
  id: PositionId;
  name: string;
  short: string;
  /** Percentage coordinates for the pitch diagram. */
  x: number;
  y: number;
}

export const POSITION_OPTIONS: readonly PositionOption[] = POSITIONS.map((p) => ({
  id: p.id,
  name: p.name,
  short: p.short,
  x: p.pitch.x,
  y: p.pitch.y,
}));

export interface NationOption {
  id: string;
  name: string;
}

export const NATION_OPTIONS: readonly NationOption[] = [...WORLD_DATA.nations]
  .map((n) => ({ id: n.id, name: n.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  pace: 'Pace',
  shooting: 'Shooting',
  passing: 'Passing',
  dribbling: 'Dribbling',
  defending: 'Defending',
  physical: 'Physical',
  flair: 'Flair',
  weakFoot: 'Weak foot',
};

export const ATTRIBUTE_ORDER: readonly AttributeKey[] = ATTRIBUTE_KEYS;

export interface ArchetypeOption {
  id: string;
  name: string;
  blurb: string;
  /** What this archetype would give you for each attribute. */
  offers: Record<AttributeKey, number>;
}

export const ARCHETYPE_OPTIONS: readonly ArchetypeOption[] = ARCHETYPES.map((a) => ({
  id: a.id,
  name: a.name,
  blurb: a.blurb,
  offers: { ...a.offers },
}));

export const CADENCE_OPTIONS: readonly { id: Cadence; name: string; detail: string }[] = [
  { id: 'full', name: 'Full', detail: 'A decision every season' },
  { id: 'standard', name: 'Standard', detail: 'A decision every other season' },
  { id: 'express', name: 'Express', detail: 'One every three seasons' },
];

export const FOOT_OPTIONS = [
  { id: 'right', name: 'Right' },
  { id: 'left', name: 'Left' },
] as const;

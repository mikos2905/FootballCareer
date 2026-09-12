import { position } from './positions';
import { clamp } from './rng';
import { ATTRIBUTE_KEYS, type Attributes, type PositionId } from './types';

/**
 * OVR is derived, always. It is never stored as a source of truth — recompute
 * it from attributes and position wherever you need it.
 */
export function computeOvr(attributes: Attributes, pos: PositionId): number {
  const weights = position(pos).weights;
  let base = 0;
  // Round each attribute first. Attributes are carried as floats between
  // seasons but shown as integers, and an OVR derived from the floats
  // disagrees with the numbers next to it.
  for (const key of ATTRIBUTE_KEYS) base += (weights[key] ?? 0) * Math.round(attributes[key] ?? 0);
  // Stretched at the ends so elite reads as elite and 99 stays genuinely hard.
  const stretched = base + (base - 62) * 0.12;
  return Math.round(clamp(stretched, 1, 99));
}

/** The OVR the player would have if every attribute reached its hidden ceiling. */
export function ceilingOvr(ceiling: Attributes, pos: PositionId): number {
  return computeOvr(ceiling, pos);
}

export { computeMarketValue, computeWage } from './transfers';

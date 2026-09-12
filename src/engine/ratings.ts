import { position } from './positions';
import { clamp } from './rng';
import { ATTRIBUTE_KEYS, type Attributes, type PositionId } from './types';

/**
 * OVR is a positional weighting of the eight attributes, stretched slightly at
 * the ends so that an elite player reads as elite and 99 stays genuinely hard.
 */
export function computeOvr(attributes: Attributes, pos: PositionId): number {
  const weights = position(pos).weights;
  let base = 0;
  for (const key of ATTRIBUTE_KEYS) base += (weights[key] ?? 0) * (attributes[key] ?? 0);
  const stretched = base + (base - 62) * 0.12;
  return Math.round(clamp(stretched, 1, 99));
}

/** The OVR the player would have if every attribute reached its hidden ceiling. */
export function ceilingOvr(ceiling: Attributes, pos: PositionId): number {
  return computeOvr(ceiling, pos);
}

const MILLION = 1_000_000;

/**
 * Market value in euros. Exponential in OVR, then modulated by the things that
 * actually move a fee: age, shop window, fame and contract length.
 */
export function computeMarketValue(params: {
  ovr: number;
  age: number;
  reputation: number;
  leaguePrestige: number;
  clubPrestige: number;
  contractYearsRemaining: number;
}): number {
  const { ovr, age, reputation, leaguePrestige, clubPrestige, contractYearsRemaining } = params;
  const base = Math.exp((ovr - 50) / 8.5) * MILLION;
  const ageFactor =
    age <= 26 ? 1 - Math.max(0, 21 - age) * 0.02 : clamp(1 - (age - 26) * 0.11, 0.06, 1);
  const leagueFactor = 0.7 + (leaguePrestige / 100) * 0.45;
  const clubFactor = 0.9 + (clubPrestige / 100) * 0.2;
  const repFactor = 0.85 + (reputation / 100) * 0.3;
  const contractFactor = contractYearsRemaining <= 0 ? 0.5 : contractYearsRemaining === 1 ? 0.7 : contractYearsRemaining === 2 ? 0.88 : 1;
  const value = base * ageFactor * leagueFactor * clubFactor * repFactor * contractFactor;
  // Round to something a transfer column would print.
  return Math.round(value / 100_000) * 100_000;
}

/** Annual wage in euros, from what the club can pay and what the player is worth. */
export function computeWage(params: {
  ovr: number;
  wageBudget: number;
  reputation: number;
  age: number;
}): number {
  const { ovr, wageBudget, reputation, age } = params;
  const base = Math.exp((ovr - 46) / 10.5) * 250_000;
  const budgetFactor = 0.35 + (wageBudget / 100) * 1.15;
  const repFactor = 0.8 + (reputation / 100) * 0.5;
  const ageFactor = age < 20 ? 0.45 : age < 23 ? 0.75 : 1;
  return Math.round((base * budgetFactor * repFactor * ageFactor) / 10_000) * 10_000;
}

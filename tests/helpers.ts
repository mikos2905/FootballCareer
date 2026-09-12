import { WORLD_DATA } from '../src/data';
import { buildWorld } from '../src/engine/world';
import { ARCHETYPES } from '../src/engine/archetypes';
import { OUTFIELD_POSITION_IDS, POSITION_IDS } from '../src/engine/positions';
import { ATTRIBUTE_KEYS, type CareerConfig, type Cadence, type Foot } from '../src/engine/types';
import { Rng } from '../src/engine/rng';
import { scriptedChooser, type CareerPolicy } from '../src/engine/career';
import { makePolicy, type StrategyName } from '../src/engine/strategies';

export const world = buildWorld(WORLD_DATA);

const CADENCES: Cadence[] = ['full', 'standard', 'express'];
const FEET: Foot[] = ['left', 'right'];

/**
 * Builds a config deterministically from a seed. Uses its own throwaway Rng so
 * that generating test inputs never touches the career's stream.
 */
export function configForSeed(seed: number, overrides: Partial<CareerConfig> = {}): CareerConfig {
  const rng = new Rng(seed ^ 0xc0ffee);
  const nations = WORLD_DATA.nations;
  const drafted = rng.chance(0.5);

  const draftPicks = drafted
    ? rng.shuffled(ARCHETYPES.map((a) => a.id)).map((archetypeId, i) => ({
        archetypeId,
        attribute: ATTRIBUTE_KEYS[i]!,
      }))
    : undefined;

  return {
    seed,
    seedLabel: String(seed),
    cadence: rng.pick(CADENCES),
    surname: `Player${seed}`,
    shirtNumber: rng.int(1, 99),
    foot: rng.pick(FEET),
    nationId: rng.pick(nations).id,
    position: rng.pick(POSITION_IDS),
    ...(draftPicks ? { draftPicks } : {}),
    ...overrides,
  };
}

/** A fixed but varied decision path, derived from a seed rather than randomly. */
export function decisionsForSeed(seed: number, length = 40): number[] {
  const rng = new Rng(seed ^ 0xdecade);
  return Array.from({ length }, () => rng.int(0, 3));
}

/**
 * A policy built from a fixed decision list plus a seeded transfer rule. Tests
 * need decisions AND transfers pinned, since both feed the career.
 */
export function scriptedPolicy(seed: number, indices: readonly number[]): CareerPolicy {
  const decide = scriptedChooser(indices);
  const moves = new Rng(seed ^ 0x30fabc);
  return {
    decide,
    transfer: ({ offers, mustMove }) => {
      if (offers.length === 0) return -1;
      if (mustMove) return moves.int(0, offers.length - 1);
      return moves.chance(0.4) ? moves.int(0, offers.length - 1) : -1;
    },
  };
}

export function strategyPolicy(name: StrategyName, seed: number): CareerPolicy {
  return makePolicy(name, seed);
}

export { OUTFIELD_POSITION_IDS, POSITION_IDS };

import { WORLD_DATA } from '../src/data';
import { buildWorld } from '../src/engine/world';
import { ARCHETYPES } from '../src/engine/archetypes';
import { POSITION_IDS } from '../src/engine/positions';
import { ATTRIBUTE_KEYS, type CareerConfig, type Cadence, type Foot } from '../src/engine/types';
import { Rng } from '../src/engine/rng';

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

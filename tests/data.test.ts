import { describe, expect, it } from 'vitest';
import { WORLD_DATA } from '../src/data';
import { buildWorld, validateWorld } from '../src/engine/world';

describe('world data', () => {
  it('is referentially intact', () => {
    expect(validateWorld(WORLD_DATA)).toEqual([]);
  });

  it('covers the shape the brief asks for', () => {
    const leagues = WORLD_DATA.leagues;
    expect(leagues.length).toBeGreaterThanOrEqual(20);
    expect(WORLD_DATA.clubs.length).toBeGreaterThanOrEqual(200);
    expect(new Set(leagues.map((l) => l.country)).size).toBeGreaterThanOrEqual(10);
    // Two domestic cups in the major countries, two continental tiers per confederation.
    expect(leagues.filter((l) => l.domesticCups.length >= 2).length).toBeGreaterThanOrEqual(10);
    const world = buildWorld(WORLD_DATA);
    for (const confed of ['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC']) {
      expect(world.continentalCup(confed, 'elite'), confed).not.toBeNull();
      expect(world.continentalCup(confed, 'secondary'), confed).not.toBeNull();
    }
  });

  it('gives every club a derby opponent', () => {
    const world = buildWorld(WORLD_DATA);
    for (const club of WORLD_DATA.clubs) {
      expect(club.rivalId, club.id).not.toBeNull();
      expect(() => world.club(club.rivalId!)).not.toThrow();
    }
  });

  it('can be swapped wholesale without the engine noticing', () => {
    // Prove the swap the brief asks for: rename everything, keep the structure,
    // and the engine builds a world exactly as happily.
    const fictional = {
      ...WORLD_DATA,
      leagues: WORLD_DATA.leagues.map((l) => ({ ...l, name: `League ${l.id}`, country: `Country ${l.id}` })),
      clubs: WORLD_DATA.clubs.map((c) => ({ ...c, name: `Club ${c.id}`, country: `Country ${c.leagueId}` })),
      competitions: WORLD_DATA.competitions.map((c) => ({ ...c, name: `Cup ${c.id}` })),
      nations: WORLD_DATA.nations.map((n) => ({ ...n, name: `Nation ${n.id}` })),
    };
    expect(validateWorld(fictional)).toEqual([]);
    expect(() => buildWorld(fictional)).not.toThrow();
  });

  it('carries no imagery or likeness fields', () => {
    const serialised = JSON.stringify(WORLD_DATA);
    for (const forbidden of ['crest', 'badge', 'logo', 'kit', 'image', 'svg', 'png', 'playerName']) {
      expect(serialised.toLowerCase().includes(forbidden)).toBe(false);
    }
  });
});

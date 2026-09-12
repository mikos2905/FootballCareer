import type { Club, Competition, League, Nation, WorldData } from './types';

/**
 * An indexed view over the world data.
 *
 * The engine never imports from src/data. It is handed a WorldData and builds
 * this. Swapping every real name for fictional ones is a JSON change and
 * nothing more.
 */
export interface World {
  readonly data: WorldData;
  league(id: string): League;
  club(id: string): Club;
  nation(id: string): Nation;
  competition(id: string): Competition;
  clubsInLeague(id: string): readonly Club[];
  leaguesInCountry(country: string): readonly League[];
  /** All leagues, strongest first. Stable order. */
  readonly leaguesByStrength: readonly League[];
  /** Continental competition for a confederation at the given tier, if one exists. */
  continentalCup(confederation: string, tier: 'elite' | 'secondary'): Competition | null;
  /** International tournament for a confederation, if one exists. */
  continentalNations(confederation: string): Competition | null;
  areRivals(a: string, b: string): boolean;
}

export function buildWorld(data: WorldData): World {
  const leagues = new Map(data.leagues.map((l) => [l.id, l]));
  const clubs = new Map(data.clubs.map((c) => [c.id, c]));
  const nations = new Map(data.nations.map((n) => [n.id, n]));
  const competitions = new Map(data.competitions.map((c) => [c.id, c]));

  const byLeague = new Map<string, Club[]>();
  for (const c of data.clubs) {
    const list = byLeague.get(c.leagueId);
    if (list) list.push(c);
    else byLeague.set(c.leagueId, [c]);
  }
  // Stable, data-order-independent sort so the RNG sees the same candidate
  // order no matter how the JSON happens to be written.
  for (const list of byLeague.values()) {
    list.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  }

  const byCountry = new Map<string, League[]>();
  for (const l of data.leagues) {
    const list = byCountry.get(l.country);
    if (list) list.push(l);
    else byCountry.set(l.country, [l]);
  }
  for (const list of byCountry.values()) list.sort((a, b) => a.tier - b.tier);

  const leaguesByStrength = data.leagues
    .slice()
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));

  const lookup = <T>(map: Map<string, T>, id: string, kind: string): T => {
    const found = map.get(id);
    if (!found) throw new Error(`Unknown ${kind}: ${id}`);
    return found;
  };

  const continentalByKey = new Map<string, Competition>();
  const internationalByConfed = new Map<string, Competition>();
  for (const c of data.competitions) {
    if (c.kind === 'continental' && c.confederation) {
      const tier = c.id.endsWith('.second') ? 'secondary' : 'elite';
      continentalByKey.set(`${c.confederation}:${tier}`, c);
    }
    if (c.kind === 'international' && c.confederation) {
      internationalByConfed.set(c.confederation, c);
    }
  }

  return {
    data,
    league: (id) => lookup(leagues, id, 'league'),
    club: (id) => lookup(clubs, id, 'club'),
    nation: (id) => lookup(nations, id, 'nation'),
    competition: (id) => lookup(competitions, id, 'competition'),
    clubsInLeague: (id) => byLeague.get(id) ?? [],
    leaguesInCountry: (country) => byCountry.get(country) ?? [],
    leaguesByStrength,
    continentalCup: (confederation, tier) => continentalByKey.get(`${confederation}:${tier}`) ?? null,
    continentalNations: (confederation) => internationalByConfed.get(confederation) ?? null,
    areRivals: (a, b) => {
      const ca = clubs.get(a);
      const cb = clubs.get(b);
      if (!ca || !cb) return false;
      return ca.rivalId === b || cb.rivalId === a;
    },
  };
}

/** Validates a data set before the engine is handed it. Cheap insurance when the
 *  JSON is swapped for a fictional set. */
export function validateWorld(data: WorldData): string[] {
  const problems: string[] = [];
  const leagueIds = new Set(data.leagues.map((l) => l.id));
  const clubIds = new Set(data.clubs.map((c) => c.id));
  const compIds = new Set(data.competitions.map((c) => c.id));
  const nationIds = new Set(data.nations.map((n) => n.id));

  const dupes = (ids: string[]) => ids.filter((v, i, a) => a.indexOf(v) !== i);
  for (const [label, ids] of [
    ['league', data.leagues.map((l) => l.id)],
    ['club', data.clubs.map((c) => c.id)],
    ['competition', data.competitions.map((c) => c.id)],
    ['nation', data.nations.map((n) => n.id)],
  ] as const) {
    for (const d of dupes(ids as string[])) problems.push(`duplicate ${label} id: ${d}`);
  }

  for (const l of data.leagues) {
    for (const cup of l.domesticCups) {
      if (!compIds.has(cup)) problems.push(`league ${l.id} references unknown cup ${cup}`);
    }
    if (data.clubs.every((c) => c.leagueId !== l.id)) problems.push(`league ${l.id} has no clubs`);
  }
  for (const c of data.clubs) {
    if (!leagueIds.has(c.leagueId)) problems.push(`club ${c.id} references unknown league ${c.leagueId}`);
    if (c.rivalId && !clubIds.has(c.rivalId)) problems.push(`club ${c.id} references unknown rival ${c.rivalId}`);
    if (c.rivalId === c.id) problems.push(`club ${c.id} is its own rival`);
  }
  for (const n of data.nations) {
    for (const id of n.homeLeagueIds) {
      if (!leagueIds.has(id)) problems.push(`nation ${n.id} references unknown league ${id}`);
    }
    for (const id of n.alternativeNationIds ?? []) {
      if (!nationIds.has(id)) problems.push(`nation ${n.id} references unknown nation ${id}`);
    }
    if (n.homeLeagueIds.length === 0) problems.push(`nation ${n.id} has no home leagues`);
  }
  return problems;
}

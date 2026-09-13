import { clamp, Rng } from './rng';
import type { Club, WorldData, WorldState } from './types';
import type { World } from './world';

/**
 * The football world outside the player.
 *
 * Fixtures are never simulated. Each league's table is drawn once per season
 * from club strength plus noise, and title, continental qualification,
 * promotion and relegation fall out of that. Clubs then drift slowly toward an
 * anchor set by their prestige, so a fallen giant can climb back and a
 * well-run club can rise — and the league you joined at 20 is not the league
 * you are playing in at 30.
 */

/** Spread of a 38-game league season, in strength points. */
const TABLE_NOISE = 6.4;
/** How fast a club's strength closes on its anchor each season. */
const DRIFT_RATE = 0.08;
const DRIFT_NOISE = 2.2;

export function initialWorldState(data: WorldData): WorldState {
  const clubs: WorldState['clubs'] = {};
  for (const club of data.clubs) {
    clubs[club.id] = {
      clubId: club.id,
      leagueId: club.leagueId,
      strength: club.strength,
      lastPosition: 0,
      continentalHolder: false,
    };
  }
  return { season: 0, clubs };
}

export function clubStrength(state: WorldState, clubId: string): number {
  return state.clubs[clubId]?.strength ?? 50;
}

export function clubLeagueId(state: WorldState, clubId: string): string {
  const club = state.clubs[clubId];
  if (!club) throw new Error(`Club not in world state: ${clubId}`);
  return club.leagueId;
}

/** Clubs currently in a division, strongest first. Stable for equal strength. */
export function clubsInLeague(world: World, state: WorldState, leagueId: string): Club[] {
  const out: Club[] = [];
  for (const club of world.data.clubs) {
    if (state.clubs[club.id]?.leagueId === leagueId) out.push(club);
  }
  out.sort(
    (a, b) => clubStrength(state, b.id) - clubStrength(state, a.id) || a.id.localeCompare(b.id),
  );
  return out;
}

export interface LeagueTable {
  leagueId: string;
  /** Club ids in finishing order, champion first. */
  order: string[];
  position: Record<string, number>;
}

/**
 * One league's finishing order.
 *
 * `nudge` is the player's contribution to their own club, in strength points.
 * It is deliberately modest: enough that a great individual season tips a
 * close title race, never enough to carry a weak squad.
 */
export function drawLeagueTable(
  rng: Rng,
  world: World,
  state: WorldState,
  leagueId: string,
  nudge: { clubId: string; points: number } | null,
): LeagueTable {
  const clubs = clubsInLeague(world, state, leagueId);
  const scored = clubs.map((club) => {
    const base = clubStrength(state, club.id) + (nudge && nudge.clubId === club.id ? nudge.points : 0);
    return { id: club.id, score: base + rng.around(0, TABLE_NOISE, -18, 18) };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const position: Record<string, number> = {};
  scored.forEach((entry, i) => {
    position[entry.id] = i + 1;
  });
  return { leagueId, order: scored.map((e) => e.id), position };
}

/**
 * A knockout run, resolved round by round rather than by simulating a bracket.
 * Only the player's club is tracked — who else won is not information the game
 * ever needs.
 */
export function runKnockout(
  rng: Rng,
  ownStrength: number,
  fieldStrengths: readonly number[],
  rounds: number,
): boolean {
  if (fieldStrengths.length === 0) return false;
  const mean = fieldStrengths.reduce((a, b) => a + b, 0) / fieldStrengths.length;
  const spread = Math.max(
    4,
    Math.sqrt(fieldStrengths.reduce((a, b) => a + (b - mean) ** 2, 0) / fieldStrengths.length),
  );
  for (let round = 0; round < rounds; round += 1) {
    // Opposition gets stronger the deeper the run goes.
    const bias = (round / Math.max(1, rounds - 1)) * spread * 1.1;
    const opponent = rng.around(mean + bias, spread, 1, 99);
    // A single knockout tie is far more open than a league season.
    const p = 1 / (1 + Math.exp(-(ownStrength - opponent) / 11));
    if (!rng.chance(clamp(p, 0.06, 0.94))) return false;
  }
  return true;
}

export function knockoutRounds(fieldSize: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, fieldSize))));
}

export interface SeasonWorldResult {
  tables: Record<string, LeagueTable>;
}

/** Draws every division's table for the season. */
export function simulateWorldSeason(
  rng: Rng,
  world: World,
  state: WorldState,
  nudge: { clubId: string; points: number } | null,
): SeasonWorldResult {
  const tables: Record<string, LeagueTable> = {};
  for (const league of world.data.leagues) {
    tables[league.id] = drawLeagueTable(rng, world, state, league.id, nudge);
  }
  return { tables };
}

/**
 * Applies promotion, relegation and strength drift. Runs after a season has
 * been played and recorded.
 */
export function advanceWorld(
  rng: Rng,
  world: World,
  state: WorldState,
  result: SeasonWorldResult,
): void {
  const moves: { clubId: string; toLeagueId: string; direction: 1 | -1 }[] = [];

  for (const league of world.data.leagues) {
    const table = result.tables[league.id];
    if (!table) continue;
    const above = world.leaguesInCountry(league.country).find((l) => l.tier === league.tier - 1);
    const below = world.leaguesInCountry(league.country).find((l) => l.tier === league.tier + 1);

    for (const clubId of table.order) {
      const entry = state.clubs[clubId];
      if (entry) entry.lastPosition = table.position[clubId] ?? 0;
    }

    if (above && league.promotionSpots > 0) {
      for (const clubId of table.order.slice(0, league.promotionSpots)) {
        moves.push({ clubId, toLeagueId: above.id, direction: 1 });
      }
    }
    if (below && league.relegationSpots > 0) {
      for (const clubId of table.order.slice(-league.relegationSpots)) {
        moves.push({ clubId, toLeagueId: below.id, direction: -1 });
      }
    }
  }

  for (const move of moves) {
    const entry = state.clubs[move.clubId];
    if (!entry) continue;
    entry.leagueId = move.toLeagueId;
    // A promoted club spends to survive; a relegated one sells to balance the
    // books. Without this the divisions blur into each other within a decade
    // and the gap between the top flight and the rest stops meaning anything.
    const destinationAverage = leagueAverageStrength(world, state, move.toLeagueId);
    // Both directions converge on the destination division at the same rate.
    // Slowing the promoted side down makes things worse, not better: a weaker
    // club in the top flight is an easier one to hold down a place at, so more
    // players end up recorded as having played top-flight football, not fewer.
    const pull = (destinationAverage - entry.strength) * 0.45;
    entry.strength = clamp(entry.strength + pull + (move.direction === 1 ? 1.5 : -2), 18, 97);
  }

  for (const club of world.data.clubs) {
    const entry = state.clubs[club.id];
    if (!entry) continue;
    // Prestige pulls a club a few points either way from its own level; it does
    // not define that level. Anchoring directly on prestige collapses every
    // low-prestige club over a career, because a modest club's prestige sits
    // far below the strength it actually fields.
    const anchor = club.strength + clamp((club.prestige - club.strength) * 0.25, -6, 8);
    const pull = (anchor - entry.strength) * DRIFT_RATE;
    entry.strength = clamp(entry.strength + pull + rng.around(0, DRIFT_NOISE, -6, 6), 18, 97);
  }

  state.season += 1;
}

/** Average squad strength of a division, for difficulty context. */
export function leagueAverageStrength(world: World, state: WorldState, leagueId: string): number {
  const clubs = clubsInLeague(world, state, leagueId);
  if (clubs.length === 0) return 50;
  return clubs.reduce((sum, c) => sum + clubStrength(state, c.id), 0) / clubs.length;
}

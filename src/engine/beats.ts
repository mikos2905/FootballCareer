import { callUpThreshold } from './international';
import type { CareerState } from './types';
import type { World } from './world';

/**
 * Scripted beats.
 *
 * These fire on a guaranteed cadence, independent of the RNG, so no run is
 * empty. What happens in a beat depends on state and seed; whether it happens
 * does not.
 */
export type BeatId =
  | 'first-contract'
  | 'first-derby'
  | 'transfer-window'
  | 'injury-window'
  | 'national-decision'
  | 'retirement';

export const RETIREMENT_WINDOW_OPENS = 33;
export const RETIREMENT_FORCED_AT = 40;
/** No more than this many seasons may pass without a transfer-window beat. */
export const TRANSFER_WINDOW_MAX_GAP = 3;

function firedAt(state: CareerState, beat: BeatId): number | null {
  let latest: number | null = null;
  for (const entry of state.firedBeats) {
    const [id, season] = entry.split(':');
    if (id !== beat) continue;
    const n = season === undefined ? 0 : Number(season);
    if (latest === null || n > latest) latest = n;
  }
  return latest;
}

export function hasFired(state: CareerState, beat: BeatId): boolean {
  return firedAt(state, beat) !== null;
}

export function markFired(state: CareerState, beat: BeatId): string[] {
  return [...state.firedBeats, `${beat}:${state.season}`];
}

/**
 * Beats owed this season, in priority order. Retirement outranks everything;
 * a career-defining transfer outranks a training block.
 */
export function dueBeats(state: CareerState, world: World): BeatId[] {
  const due: BeatId[] = [];
  const { player } = state;
  const lastSeason = state.seasons[state.seasons.length - 1];

  if (player.age >= RETIREMENT_WINDOW_OPENS) due.push('retirement');

  if (!hasFired(state, 'first-contract') && state.season >= 1) {
    due.push('first-contract');
  }

  if (!hasFired(state, 'first-derby')) {
    const club = world.club(state.clubId);
    const playedEnough = (lastSeason?.minutes ?? 0) >= 500;
    // Guaranteed by 20 even if he has barely kicked a ball, so the beat always lands.
    if ((club.rivalId && playedEnough) || player.age >= 20) due.push('first-derby');
  }

  const lastTransfer = firedAt(state, 'transfer-window');
  const sinceTransfer = lastTransfer === null ? state.season : state.season - lastTransfer;
  if (state.season >= 1 && sinceTransfer >= TRANSFER_WINDOW_MAX_GAP) due.push('transfer-window');

  if (!hasFired(state, 'injury-window') && player.age >= 24 && player.age <= 29) {
    // Somewhere in the mid-career, guaranteed before the window closes.
    if (player.age >= 27 || state.condition.wear >= 35) due.push('injury-window');
  }

  if (!hasFired(state, 'national-decision') && !state.national.committed) {
    const home = world.nation(player.nationId);
    if (player.reputation >= callUpThreshold(home.strength) * 0.85) due.push('national-decision');
  }

  return due;
}

/** True when the player must hang up the boots regardless of what he wants. */
export function mustRetire(state: CareerState): boolean {
  return state.player.age >= RETIREMENT_FORCED_AT;
}

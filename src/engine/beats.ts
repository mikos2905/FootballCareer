import { callUpThreshold, selectionScore } from './international';
import { clubLeagueId } from './league';
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

export const RETIREMENT_WINDOW_OPENS = 32;
export const RETIREMENT_FORCED_AT = 40;
/**
 * How often the retirement question is actually put once the window is open.
 *
 * Due every season, it starved the whole of late career: beats outrank the
 * weighted draw, so from thirty-three onwards every single decision point was
 * the same question about stopping, and not one card written for the twilight
 * ever came up. A player nearing the end should be asked now and then, not
 * annually — and always when the body or the calendar forces it.
 */
export const RETIREMENT_BEAT_GAP = 2;
/** Wear above which the question is put regardless of when it was last asked. */
export const RETIREMENT_WEAR_PROMPT = 68;
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

  if (player.age >= RETIREMENT_WINDOW_OPENS) {
    const lastAsked = firedAt(state, 'retirement');
    const since = lastAsked === null ? Infinity : state.season - lastAsked;
    // Past thirty-five the question is live every summer whatever the answer
    // was last time, because at that age it is.
    const pressing =
      player.age >= 35 ||
      player.age >= RETIREMENT_FORCED_AT - 1 ||
      state.condition.wear >= RETIREMENT_WEAR_PROMPT;
    if (since >= RETIREMENT_BEAT_GAP || pressing) due.push('retirement');
  }

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

  // Guaranteed football injuries: one early, then again roughly every six
  // seasons. Every career carries at least one, which is the point of scripting
  // it rather than leaving it to the hazard roll.
  const lastInjuryWindow = firedAt(state, 'injury-window');
  if (player.age >= 17 && (lastInjuryWindow === null || state.season - lastInjuryWindow >= 6)) {
    due.push('injury-window');
  }

  if (!hasFired(state, 'national-decision') && !state.national.committed) {
    const home = world.nation(player.nationId);
    // Judged on the same basis a call-up is: how good he is, adjusted for how
    // visible his league is. Gating this on reputation instead meant defenders
    // and goalkeepers were never capped, because reputation is driven by goals.
    const league = world.league(clubLeagueId(state.world, state.clubId));
    const score = selectionScore(player.ovr, league);
    if (score >= callUpThreshold(home.strength) - 4) due.push('national-decision');
  }

  return due;
}

/** True when the player must hang up the boots regardless of what he wants. */
export function mustRetire(state: CareerState): boolean {
  return state.player.age >= RETIREMENT_FORCED_AT;
}

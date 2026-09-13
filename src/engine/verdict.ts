import { clubLeagueId } from './league';
import type { CareerState, SeasonRecord, TrophyWin } from './types';
import type { World } from './world';

/**
 * Turning points: the specific moments a verdict is built out of.
 *
 * A verdict that names the derby you played half fit at twenty-nine reads as a
 * life. One that says "you had a distinguished career" reads as a lookup table,
 * and the second run gives the trick away.
 */
export interface TurningPoints {
  breakthrough: SeasonRecord | null;
  best: SeasonRecord | null;
  worst: SeasonRecord | null;
  biggestMove: { from: SeasonRecord; to: SeasonRecord } | null;
  injuryYear: SeasonRecord | null;
  firstTrophy: TrophyWin | null;
  biggestTrophy: TrophyWin | null;
  homeClubId: string | null;
  homeSeasons: number;
  finalSeason: SeasonRecord | null;
  firstSeason: SeasonRecord | null;
  peakSeason: SeasonRecord | null;
  clubsPlayedFor: number;
}

export function findTurningPoints(state: CareerState, world: World): TurningPoints {
  const seasons = state.seasons;
  const playing = seasons.filter((s) => s.minutes > 0);

  // The season he arrived: the first with a real amount of football in it.
  const breakthrough = seasons.find((s) => s.minutes >= 1800) ?? null;

  const rated = seasons.filter((s) => s.averageRating > 0);
  const best = rated.length > 0 ? rated.reduce((a, b) => (b.averageRating > a.averageRating ? b : a)) : null;
  const worst =
    rated.length > 2 ? rated.reduce((a, b) => (b.averageRating < a.averageRating ? b : a)) : null;

  // The move that changed the most, measured by the jump in league strength.
  let biggestMove: TurningPoints['biggestMove'] = null;
  let biggestJump = 0.06;
  for (let i = 1; i < seasons.length; i += 1) {
    const from = seasons[i - 1]!;
    const to = seasons[i]!;
    if (from.clubId === to.clubId) continue;
    const jump = Math.abs(world.league(to.leagueId).strength - world.league(from.leagueId).strength);
    if (jump > biggestJump) {
      biggestJump = jump;
      biggestMove = { from, to };
    }
  }

  const injuryYear =
    seasons.filter((s) => s.matchesMissed >= 12).sort((a, b) => b.matchesMissed - a.matchesMissed)[0] ?? null;

  const trophies = state.trophies;
  const firstTrophy = trophies[0] ?? null;
  const biggestTrophy =
    trophies.length > 0
      ? trophies.reduce((a, b) =>
          world.competition(b.competitionId).prestige > world.competition(a.competitionId).prestige ? b : a,
        )
      : null;

  const bestStanding = [...state.clubStandings].sort((a, b) => b.standing - a.standing)[0] ?? null;
  const homeClubId = bestStanding?.clubId ?? null;
  const homeSeasons = homeClubId ? seasons.filter((s) => s.clubId === homeClubId).length : 0;

  const peakSeason =
    seasons.length > 0 ? seasons.reduce((a, b) => (b.ovrEnd > a.ovrEnd ? b : a)) : null;

  return {
    breakthrough,
    best,
    worst,
    biggestMove,
    injuryYear,
    firstTrophy,
    biggestTrophy,
    homeClubId,
    homeSeasons,
    finalSeason: seasons[seasons.length - 1] ?? null,
    firstSeason: seasons[0] ?? null,
    peakSeason,
    clubsPlayedFor: new Set(playing.map((s) => s.clubId)).size,
  };
}

/**
 * Sentences about specific things that happened, drawn on to fill a verdict.
 *
 * Each returns null when the career has nothing to say on that subject, so the
 * frame can ask for four and take whatever it gets.
 */
export function verdictFragments(state: CareerState, world: World, points: TurningPoints): string[] {
  const out: string[] = [];
  const name = state.player.surname;

  if (points.breakthrough) {
    const s = points.breakthrough;
    out.push(
      `He arrived at ${s.age} — ${s.appearances} games for ${s.clubName} in ${s.year}, in a ${s.leagueName} side that finished ${s.leaguePosition || 'nowhere in particular'}.`,
    );
  } else if (points.firstSeason) {
    out.push(`He never really arrived. The football was always somebody else's.`);
  }

  if (points.best && points.best.averageRating >= 7) {
    const s = points.best;
    const line = s.keeper
      ? `${s.keeper.cleanSheets} clean sheets`
      : `${s.goals} goals and ${s.assists} assists`;
    out.push(`The year it all worked was ${s.year}: ${line} for ${s.clubName}, at ${s.averageRating.toFixed(1)} a game.`);
  }

  if (points.biggestMove) {
    const { from, to } = points.biggestMove;
    const up = world.league(to.leagueId).strength > world.league(from.leagueId).strength;
    out.push(
      up
        ? `The move that changed it was ${from.clubName} to ${to.clubName} at ${to.age}, out of ${from.leagueName} and into ${to.leagueName}.`
        : `Leaving ${from.clubName} for ${to.clubName} at ${to.age} was a step down, and he never got the level back.`,
    );
  }

  if (points.injuryYear) {
    const s = points.injuryYear;
    const injury = s.injuries.sort((a, b) => b.matchesMissed - a.matchesMissed)[0];
    out.push(
      injury
        ? `The ${injury.label.toLowerCase()} at ${s.age} cost him ${s.matchesMissed} matches, and ${s.year} is a hole in the record.`
        : `${s.year} was lost to injury almost entirely.`,
    );
  }

  if (points.biggestTrophy) {
    const t = points.biggestTrophy;
    out.push(`He won the ${t.competitionName} with ${t.clubName ?? 'his country'} in ${t.year}.`);
  }

  if (state.national.caps >= 10) {
    const nation = world.nation(state.national.nationId ?? state.player.nationId).name;
    out.push(
      state.national.tournamentsWon > 0
        ? `${state.national.caps} caps for ${nation}, and a tournament.`
        : `${state.national.caps} caps for ${nation}, and never a tournament won.`,
    );
  } else if (state.national.caps === 0 && state.peakOvr >= 72) {
    out.push(`${world.nation(state.player.nationId).name} never called, which is the part he will think about.`);
  }

  if (points.homeClubId && points.homeSeasons >= 5) {
    out.push(
      `${points.homeSeasons} seasons at ${world.club(points.homeClubId).name} — long enough for the people there to think of him as theirs.`,
    );
  }

  if (points.clubsPlayedFor >= 7) {
    out.push(`${points.clubsPlayedFor} clubs in ${state.seasons.length} seasons. He was always somebody's new signing.`);
  }

  void name;
  return out;
}

/** Where he finished, in words. */
export function closingLine(state: CareerState, world: World, points: TurningPoints): string {
  const last = points.finalSeason;
  if (!last) return 'It ended before it began.';
  const club = world.club(last.clubId).name;
  const league = world.league(clubLeagueId(state.world, last.clubId)).name;
  switch (state.endReason) {
    case 'injury':
      return `It ended at ${last.age} on a treatment table at ${club}, which is not how anyone plans it.`;
    case 'attrition':
      return `It ended at ${last.age} because the phone stopped ringing. There was no last game, only a last season nobody marked.`;
    case 'forced-age':
      return `He played until the game would not have him any longer, finishing at ${club} in ${league}.`;
    case 'retired':
    default:
      return `He finished at ${club}, in ${league}, and chose the day himself.`;
  }
}

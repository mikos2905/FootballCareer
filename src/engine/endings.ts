import { realisation } from './development';
import { ceilingOvr } from './ratings';
import { clamp, substream } from './rng';
import { scoreCareer, type ScoreComponents, type ScoreDetail } from './scoring';
import type { CareerState } from './types';
import { closingLine, findTurningPoints, verdictFragments, type TurningPoints } from './verdict';
import type { World } from './world';

/**
 * Endings.
 *
 * These are not score bands. They are pattern matches on the shape of a career,
 * which is why a player can retire with a good score and still be told,
 * accurately, that they wasted it — and that is the ending people replay to
 * escape.
 */

export type EndingTier =
  | 'statue'
  | 'global-superstar'
  | 'serial-winner'
  | 'cult-hero'
  | 'journeyman'
  | 'what-might-have-been';

export const TIER_LABELS: Record<EndingTier, string> = {
  statue: 'Statue',
  'global-superstar': 'Global Superstar',
  'serial-winner': 'Serial Winner',
  'cult-hero': 'Cult Hero',
  journeyman: 'Journeyman',
  'what-might-have-been': 'What Might Have Been',
};

export interface CareerTotals {
  seasons: number;
  earnings: number;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  trophyCount: number;
  trophyWeight: number;
  caps: number;
  internationalGoals: number;
  clubsPlayedFor: number;
}

export interface Ending {
  tier: EndingTier;
  label: string;
  verdict: string;
  careerScore: number;
  components: ScoreComponents;
  scoreLines: ScoreDetail['lines'];
  /** Kept for the harness and the phase 2 reports. */
  statsScore: number;
  idolScore: number;
  realisation: number;
  ceilingOvr: number;
  homeClubId: string | null;
}

export function computeTotals(state: CareerState, world: World): CareerTotals {
  const totals: CareerTotals = {
    seasons: state.seasons.length,
    earnings: 0,
    appearances: 0,
    goals: 0,
    assists: 0,
    minutes: 0,
    trophyCount: state.trophies.length,
    trophyWeight: 0,
    caps: state.national.caps,
    internationalGoals: state.national.goals,
    clubsPlayedFor: new Set(state.seasons.map((s) => s.clubId)).size,
  };
  for (const s of state.seasons) {
    totals.earnings += s.wage;
    totals.appearances += s.appearances;
    totals.goals += s.goals;
    totals.assists += s.assists;
    totals.minutes += s.minutes;
  }
  for (const t of state.trophies) totals.trophyWeight += world.competition(t.competitionId).prestige;
  return totals;
}

/** The shape of a career, which is what the tiers actually match on. */
interface Shape {
  bestStanding: number;
  homeShare: number;
  homeSeasons: number;
  trophyWeight: number;
  peakOvr: number;
  ceiling: number;
  realised: number;
  caps: number;
  tournaments: number;
  seasons: number;
  totals: CareerTotals;
}

function shapeOf(state: CareerState, totals: CareerTotals): Shape {
  const best = [...state.clubStandings].sort((a, b) => b.standing - a.standing)[0];
  const homeSeasons = best ? state.seasons.filter((s) => s.clubId === best.clubId).length : 0;
  return {
    bestStanding: best?.standing ?? 1,
    homeShare: totals.seasons > 0 ? homeSeasons / totals.seasons : 0,
    homeSeasons,
    trophyWeight: totals.trophyWeight,
    peakOvr: state.peakOvr,
    ceiling: ceilingOvr(state.player.ceiling, state.player.position),
    realised: realisation(state.player.attributes, state.player.ceiling, state.player.position),
    caps: totals.caps,
    tournaments: state.national.tournamentsWon,
    seasons: totals.seasons,
    totals,
  };
}

/**
 * Tier, in priority order.
 *
 * Order matters: a career can match several shapes, and the first one it
 * matches is the one that describes it best. What Might Have Been sits above
 * Journeyman but below the achievements, because a career that genuinely won
 * things was not wasted however short of its ceiling it fell.
 */
function pickTier(shape: Shape): EndingTier {
  // Statue: standing maxed at a club where the majority of the career was spent.
  if (shape.bestStanding >= 92 && shape.homeShare > 0.55 && shape.homeSeasons >= 8) return 'statue';

  // Global superstar: reached the top of the game and was seen doing it.
  if (shape.peakOvr >= 86 && (shape.caps >= 40 || shape.trophyWeight >= 700)) return 'global-superstar';

  // Serial winner: a cabinet, wherever it was filled. Weight alone was set
  // against a league that hands out more silverware than this one does — at 900
  // the tier was reachable by about one career in a hundred and forty, so it
  // also counts a plain pile of medals and an international tournament.
  if (shape.trophyWeight >= 420 || shape.totals.trophyCount >= 5 || shape.tournaments >= 1) {
    return 'serial-winner';
  }

  // What might have been: the ceiling was there and the career did not reach it.
  // Checked before the consolation tiers, and only for a genuinely high ceiling.
  if (shape.ceiling >= 70 && shape.realised < 0.85 && shape.ceiling - shape.peakOvr >= 9) {
    return 'what-might-have-been';
  }

  // Cult hero: meant something somewhere, without the trophies or the ceiling.
  if (shape.bestStanding >= 58 && shape.homeShare > 0.25) return 'cult-hero';

  return 'journeyman';
}

/**
 * The verdict, composed rather than selected.
 *
 * Each tier has a frame that says what kind of career it was, then the actual
 * clubs, seasons and turning points are dropped into it. The fragments chosen
 * vary with the career and with the seed, so two Journeymen do not read alike.
 */
function composeVerdict(
  tier: EndingTier,
  state: CareerState,
  world: World,
  points: TurningPoints,
  shape: Shape,
): string {
  const name = state.player.surname;
  const home = points.homeClubId ? world.club(points.homeClubId).name : null;
  const fragments = verdictFragments(state, world, points);

  // Seeded, so the same career always reads the same way.
  const rng = substream(state.seed, 'decisions', 777_777);
  const picked = rng.shuffled(fragments).slice(0, 3);

  const opening = (() => {
    switch (tier) {
      case 'statue':
        return `${points.homeSeasons} seasons at ${home}, and he never once went looking for anywhere else. There will be a bronze of him outside the ${home} ground and children who never saw him play will be told who he was.`;
      case 'global-superstar':
        return `He got as high as this game goes — ${shape.peakOvr} at his peak, and a name that meant something in countries he never played in.`;
      case 'serial-winner':
        return `${shape.totals.trophyCount} trophies. He went where the medals were, collected them, and moved on before anyone got sentimental.`;
      case 'cult-hero':
        return `Never the best player in the league, and at ${home} that was never the point. ${shape.homeSeasons} seasons there, and they still sing about him.`;
      case 'what-might-have-been':
        return `The coaches who watched ${name} at sixteen thought they were looking at a ${shape.ceiling}. He finished as a ${shape.peakOvr}. Somewhere in between is the career he did not have.`;
      case 'journeyman':
      default:
        return `${shape.totals.appearances} appearances across ${shape.totals.clubsPlayedFor} clubs. Nobody is building a statue, and nobody asked him to.`;
    }
  })();

  const closing = (() => {
    switch (tier) {
      case 'statue':
        return closingLine(state, world, points);
      case 'what-might-have-been':
        return `${closingLine(state, world, points)} The ceiling was ${shape.ceiling}, and he never saw it.`;
      case 'global-superstar':
        return home && shape.homeShare < 0.4
          ? `${closingLine(state, world, points)} Ask supporters at any of his clubs whether he was ever really theirs.`
          : closingLine(state, world, points);
      default:
        return closingLine(state, world, points);
    }
  })();

  return [opening, ...picked, closing].join(' ');
}

export function computeEnding(state: CareerState, world: World): Ending {
  const totals = computeTotals(state, world);
  const shape = shapeOf(state, totals);
  const score = scoreCareer(state, world);
  const points = findTurningPoints(state, world);
  const tier = pickTier(shape);

  return {
    tier,
    label: TIER_LABELS[tier],
    verdict: composeVerdict(tier, state, world, points, shape),
    careerScore: score.components.total,
    components: score.components,
    scoreLines: score.lines,
    // The two paths, kept separate for the reports.
    statsScore: clamp(score.components.performance + score.components.honours + score.components.peak, 0, 75),
    idolScore: score.components.standing,
    realisation: Math.round(shape.realised * 1000) / 1000,
    ceilingOvr: shape.ceiling,
    homeClubId: tier === 'statue' || tier === 'cult-hero' ? points.homeClubId : null,
  };
}

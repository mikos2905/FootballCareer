import { realisation } from './development';
import { ceilingOvr } from './ratings';
import { clamp } from './rng';
import type { CareerState } from './types';
import type { World } from './world';

/**
 * The Career Score.
 *
 * One formula, four components, documented here because a number nobody can
 * explain is a number nobody trusts.
 *
 *   Performance  25 — what he did on the pitch: appearances, output, ratings
 *   Honours      25 — what he won, weighted by what it was worth winning
 *   Peak         25 — how good he got, and how much of his ceiling that was
 *   Standing     25 — what he meant to a club, and how long he meant it for
 *
 * The weighting is deliberately even so that the two win conditions in
 * BRIEF.md section 6 can score comparably. A one-club career with standing
 * maxed gives up most of Honours and some of Peak, and takes nearly all of
 * Standing; a trophy-laden mercenary does the reverse. Neither should
 * reliably beat the other, and `npm run sim -- --report strategies` checks it.
 */

export interface ScoreComponents {
  performance: number;
  honours: number;
  peak: number;
  standing: number;
  total: number;
}

export const COMPONENT_MAX = 25;

export interface ScoreDetail {
  components: ScoreComponents;
  /** Plain-language lines for the end screen, so the total is never a mystery. */
  lines: { label: string; value: number; of: number; detail: string }[];
}

/** Diminishing returns: full marks needs an outstanding career, not a long one. */
function curve(value: number, par: number): number {
  if (value <= 0) return 0;
  return 1 - Math.exp(-value / par);
}

export function scoreCareer(state: CareerState, world: World): ScoreDetail {
  const seasons = state.seasons;
  const played = Math.max(1, seasons.length);

  // -- Performance ----------------------------------------------------------
  const appearances = seasons.reduce((n, s) => n + s.appearances, 0);
  const contributions = seasons.reduce((n, s) => n + s.goals + s.assists * 0.7, 0);
  const cleanSheets = seasons.reduce((n, s) => n + (s.keeper?.cleanSheets ?? 0), 0);
  const rated = seasons.filter((s) => s.averageRating > 0);
  const averageRating = rated.length > 0 ? rated.reduce((n, s) => n + s.averageRating, 0) / rated.length : 6;
  // Weighted by the level it was done at, so four hundred games in a third tier
  // is not four hundred games in a first one.
  const levelWeighted =
    seasons.reduce((n, s) => n + s.appearances * world.league(s.leagueId).strength, 0) / Math.max(1, appearances);
  const performance =
    COMPONENT_MAX *
    clamp(
      curve(appearances * levelWeighted, 260) * 0.45 +
        curve(contributions + cleanSheets * 0.8, 130) * 0.35 +
        clamp((averageRating - 6.1) / 1.1, 0, 1) * 0.2,
      0,
      1,
    );

  // -- Honours --------------------------------------------------------------
  const trophyWeight = state.trophies.reduce((n, t) => n + world.competition(t.competitionId).prestige, 0);
  const internationalHonours = state.national.tournamentsWon * 90 + Math.min(state.national.caps, 120) * 1.2;
  const honours = COMPONENT_MAX * clamp(curve(trophyWeight + internationalHonours, 520), 0, 1);

  // -- Peak -----------------------------------------------------------------
  const cap = ceilingOvr(state.player.ceiling, state.player.position);
  const realised = realisation(state.player.attributes, state.player.ceiling, state.player.position);
  const peakValue = clamp((state.peakOvr - 45) / 50, 0, 1);
  const peak = COMPONENT_MAX * clamp(peakValue * 0.7 + realised * 0.3, 0, 1);

  // -- Standing -------------------------------------------------------------
  // What he meant somewhere, and for how long. A career spread thinly across
  // eight clubs scores badly here however good the football was.
  const best = [...state.clubStandings].sort((a, b) => b.standing - a.standing)[0];
  const bestStanding = best?.standing ?? 1;
  const loyaltyShare = best ? seasons.filter((s) => s.clubId === best.clubId).length / played : 0;
  const standing = COMPONENT_MAX * clamp((bestStanding / 99) * 0.65 + loyaltyShare * 0.35, 0, 1);

  const components: ScoreComponents = {
    performance: Math.round(performance),
    honours: Math.round(honours),
    peak: Math.round(peak),
    standing: Math.round(standing),
    total: 0,
  };
  components.total =
    components.performance + components.honours + components.peak + components.standing;

  const bestClubName = best ? world.club(best.clubId).name : 'nowhere';
  return {
    components,
    lines: [
      {
        label: 'Performance',
        value: components.performance,
        of: COMPONENT_MAX,
        detail: `${appearances} appearances, ${Math.round(contributions)} goals and assists, ${averageRating.toFixed(1)} average rating`,
      },
      {
        label: 'Honours',
        value: components.honours,
        of: COMPONENT_MAX,
        detail:
          state.trophies.length === 0
            ? 'No trophies'
            : `${state.trophies.length} trophies, ${state.national.caps} caps`,
      },
      {
        label: 'Peak reached',
        value: components.peak,
        of: COMPONENT_MAX,
        detail: `Peaked at ${state.peakOvr} against a ceiling of ${cap} — ${Math.round(realised * 100)}% realised`,
      },
      {
        label: 'Standing',
        value: components.standing,
        of: COMPONENT_MAX,
        detail: `${Math.round(bestStanding)}/99 at ${bestClubName}, ${Math.round(loyaltyShare * 100)}% of the career there`,
      },
    ],
  };
}

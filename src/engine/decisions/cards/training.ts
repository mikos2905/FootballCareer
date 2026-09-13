import { position } from '../../positions';
import { TUNABLES as T } from '../tunables';
import type { AttributeKey } from '../../types';
import type { Card, Effect } from '../types';
import { currentClub, lastSeason } from './helpers';

/**
 * Training focus. Attribute-specific development plus a delayed effect: what you
 * worked on at 23 is what you still have at 31, and what you neglected is what
 * goes first.
 */
export const trainingFocus: Card = {
  id: 'training-focus',
  category: 'training',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough', 'prime', 'decline'],
  eligibility: (c) => c.state.player.age >= 17,
  weight: () => 22,
  prepare: (state) => {
    const def = position(state.player.position);
    // The two attributes his position leans on hardest, and the weakest thing
    // in his game — that is the actual choice a coach would put to him.
    const ranked = (Object.keys(def.weights) as AttributeKey[]).sort(
      (a, b) => (def.weights[b] ?? 0) - (def.weights[a] ?? 0),
    );
    const strengths = ranked.slice(0, 2);
    const weakest = [...ranked].sort(
      (a, b) => state.player.attributes[a] - state.player.attributes[b],
    )[0];
    return {
      labels: {
        sharpenA: strengths[0] ?? 'pace',
        sharpenB: strengths[1] ?? 'physical',
        shore: weakest ?? 'defending',
      },
    };
  },
  title: (c) => `Pre-season at ${currentClub(c).name}`,
  situation: (c) => {
    const sharpen = c.subject.labels?.sharpenA ?? 'your strengths';
    const shore = c.subject.labels?.shore ?? 'the weak side of your game';
    const last = lastSeason(c);
    const note = (last?.averageRating ?? 0) >= 6.8 ? 'You had a good one last year.' : 'Last season was not your best.';
    return `${note} The first-team coach wants you doing extra on ${sharpen} because that is what gets you picked. The academy's technical coach says ${shore} is the reason you will be a squad player at 30. They have both booked the same hour with you.`;
  },
  options: (c) => {
    const sharpenA = (c.subject.labels?.sharpenA ?? 'pace') as AttributeKey;
    const sharpenB = (c.subject.labels?.sharpenB ?? 'physical') as AttributeKey;
    const shore = (c.subject.labels?.shore ?? 'defending') as AttributeKey;
    return [
      {
        id: 'sharpen',
        label: () => `Sharpen what you are good at (${sharpenA}, ${sharpenB})`,
        detail: () => 'Lean into it. It is what gets you on the teamsheet now.',
        effects: (): Effect[] => [
          {
            kind: 'modifier',
            modifier: {
              channel: 'focus',
              attributes: [sharpenA, sharpenB],
              seasons: 3,
              label: `Working on ${sharpenA} and ${sharpenB}`,
            },
          },
          {
            kind: 'modifier',
            modifier: { channel: 'development', value: T.developmentBonusFocused, seasons: 3, label: 'Focused block' },
          },
          {
            kind: 'delayed',
            seasons: T.delayLong,
            label: `The part of your game you left alone is the part that has gone`,
            effects: [
              {
                kind: 'immediate',
                change: {
                  attributes: { [shore]: -8 } as Partial<Record<AttributeKey, number>>,
                  ceiling: { [shore]: -7 } as Partial<Record<AttributeKey, number>>,
                },
              },
            ],
          },
        ],
      },
      {
        id: 'shore-up',
        label: () => `Shore up ${shore}`,
        detail: () => 'Unglamorous, and nobody picks a side on it. It is what you will still have at 33.',
        effects: (): Effect[] => [
          {
            kind: 'modifier',
            modifier: { channel: 'focus', attributes: [shore], seasons: 3, label: `Working on ${shore}` },
          },
          {
            kind: 'modifier',
            modifier: { channel: 'development', value: T.developmentPenaltyMild, seasons: 2, label: 'Time away from your strengths' },
          },
          {
            kind: 'modifier',
            modifier: {
              channel: 'injuryRisk',
              value: T.injuryRiskRoundedAthlete,
              seasons: 6,
              label: 'A body that can cope with anything',
            },
          },
          {
            kind: 'delayed',
            seasons: T.delayLong,
            label: 'The extra work has aged well',
            effects: [
              {
                kind: 'immediate',
                change: {
                  attributes: { [shore]: 8 } as Partial<Record<AttributeKey, number>>,
                  ceiling: { [shore]: 7 } as Partial<Record<AttributeKey, number>>,
                },
              },
              {
                kind: 'modifier',
                modifier: {
                  channel: 'standing',
                  value: T.standingRoundedGame,
                  seasons: 8,
                  label: 'Rounded enough to play anywhere',
                },
              },
            ],
          },
        ],
      },
      {
        id: 'rest',
        label: () => 'Do neither and get properly fit',
        detail: () => 'A summer of rehab and conditioning. No new tricks.',
        effects: (): Effect[] => [
          { kind: 'immediate', change: { wear: -T.wearRelievedByRest, form: T.moraleBoostSmall } },
          {
            kind: 'modifier',
            modifier: { channel: 'injuryRisk', value: T.injuryRiskManagedLoad, seasons: 2, label: 'Conditioned properly' },
          },
          {
            kind: 'modifier',
            modifier: { channel: 'development', value: T.developmentPenaltyMild, seasons: 1, label: 'A summer off the training pitch' },
          },
        ],
      },
    ];
  },
};

/**
 * The fallback. A silent season feels broken, so when nothing else is eligible
 * the player still gets a decision — a small one, about how he spends a year.
 */
export const seasonalOutlook: Card = {
  id: 'seasonal-outlook',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough', 'prime', 'decline', 'twilight'],
  eligibility: () => true,
  weight: () => 1,
  title: (c) =>
    c.state.seasons.length === 0
      ? `Your first pre-season at ${currentClub(c).name}`
      : `Another season at ${currentClub(c).name}`,
  situation: (c) => {
    const club = currentClub(c);
    const last = lastSeason(c);
    if (!last) {
      return `You signed schoolboy forms at ${club.name} when you were eleven and you have never played anywhere else. Pre-season starts in ten days with the under-18s, and one afternoon a week with the first team if the manager remembers. Nobody has told you what is expected of you.`;
    }
    const mins = last.minutes;
    const tone =
      mins > 2200
        ? 'You played nearly every week last year and the body knows it.'
        : mins > 900
          ? 'You were in and out of the side last year.'
          : 'You barely played last year.';
    return `${tone} Pre-season at ${club.name} starts in ten days and nothing much has changed: same manager, same squad, same ideas. How you spend the year is largely up to you.`;
  },
  options: () => [
    {
      id: 'professional',
      label: () => 'Head down, do the job',
      detail: () => 'Nothing dramatic. Turn up, train, play.',
      effects: (): Effect[] => [
        { kind: 'immediate', change: { form: T.moraleBoostSmall, managerRelationship: T.managerTrustGain } },
        {
          kind: 'modifier',
          modifier: { channel: 'injuryRisk', value: T.injuryRiskManagedLoad, seasons: 2, label: 'Sensible about it' },
        },
      ],
    },
    {
      id: 'extra-work',
      label: () => 'Put the extra hours in',
      detail: () => 'Afternoons at the training ground. It costs you the rest.',
      effects: (): Effect[] => [
        { kind: 'immediate', change: { wear: T.wearFromHardPreSeason * 2 } },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentBonusExtraHours, seasons: 3, label: 'Extra hours' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'injuryRisk', value: T.injuryRiskOvertrained, seasons: 3, label: 'Running on empty' },
        },
      ],
    },
    {
      id: 'enjoy-it',
      label: () => 'Enjoy yourself a bit',
      detail: () => 'You are a young man with money. The staff notice these things.',
      effects: (): Effect[] => [
        { kind: 'immediate', change: { form: T.moraleBoostLarge * 1.5, managerRelationship: -T.managerTrustLoss } },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentPenaltyBenchSeason, seasons: 3, label: 'Not living like a monk' },
        },
        {
          kind: 'delayed',
          seasons: T.delayMedium,
          label: 'The conditioning coach has been keeping a file',
          effects: [
            { kind: 'immediate', change: { injuryProneness: 6, wear: 9 } },
            {
              kind: 'modifier',
              modifier: { channel: 'injuryRisk', value: T.injuryRiskCarryingWeight, seasons: 3, label: 'Carrying a bit too much' },
            },
          ],
        },
      ],
    },
  ],
};

export const trainingCards = [trainingFocus, seasonalOutlook];

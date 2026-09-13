import { clubStrength } from '../../league';
import { TUNABLES as T } from '../tunables';
import type { Card } from '../types';
import { clubName, currentClub, currentLeague, money, seasonsAt, standingAt } from './helpers';

/**
 * First professional contract — the scheduled beat from BRIEF.md section 2.
 *
 * Wage against release clause. The clause is the interesting bit: it is worth
 * nothing until somebody wants you, and then it is worth everything, and the
 * club knows that better than you do.
 */
export const firstContract: Card = {
  id: 'first-contract',
  category: 'contract',
  kind: 'scheduled',
  beat: 'first-contract',
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 21,
  weight: () => 100,
  title: (c) => `${currentClub(c).name} offer terms`,
  situation: (c) => {
    const club = currentClub(c);
    const wage = money(c.state.wage);
    return `The academy director has you in his office with a contract and a pen. It is ${wage} a year, which is more money than anyone in your family has earned, and the release clause is set high enough that ${club.name} are not worried about it. Your agent is outside and has views.`;
  },
  options: () => [
    {
      id: 'sign-clean',
      label: () => 'Sign what is in front of you',
      detail: (c) => `${clubName(c, c.state.clubId)} get their answer today and everyone in the building hears about it.`,
      effects: () => [
        {
          kind: 'immediate',
          change: {
            contractYears: T.contractYearsStandard,
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyLarge },
            managerRelationship: T.managerTrustLarge,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesBonusTrusted, seasons: 4, label: 'Trusted by the staff' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentBonusEliteCoaching, seasons: 3, label: 'Given every chance' },
        },
      ],
    },
    {
      id: 'push-wage',
      label: () => 'Let the agent push the money',
      detail: () => 'He will get you more. The club will remember who made them go back to the board.',
      effects: () => [
        {
          kind: 'immediate',
          change: {
            contractYears: T.contractYearsStandard,
            wage: T.wageUpliftLarge,
            clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub },
            managerRelationship: -T.managerTrustLoss,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesPenaltySlight, seasons: 2, label: 'Made them go back to the board' },
        },
        {
          kind: 'delayed',
          seasons: T.delayShort,
          label: 'The board have not forgotten how that negotiation went',
          effects: [
            {
              kind: 'immediate',
              change: { clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub } },
            },
          ],
        },
      ],
    },
    {
      id: 'low-clause',
      label: () => 'Take less, insist on a low release clause',
      detail: () => 'A number that lets you leave cheaply if somebody comes. Nobody has come.',
      effects: () => [
        {
          kind: 'immediate',
          change: {
            contractYears: T.contractYearsLong,
            wage: T.wageCutLoyalty,
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus / 2 },
            marketValue: T.marketValueDropStagnation,
          },
        },
        {
          kind: 'delayed',
          seasons: T.delayMedium,
          label: 'The clause you insisted on is the reason the phone is ringing',
          effects: [
            {
              kind: 'immediate',
              change: { marketValue: T.marketValueBumpTransferListed, reputation: T.reputationGainShowcase * 1.5, contractYears: 1 },
            },
            {
              kind: 'modifier',
              modifier: { channel: 'minutes', value: T.minutesBonusShopWindow, seasons: 2, label: 'Playing for a move' },
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Late career: a testimonial and a coaching badge, or one more contract
 * somewhere that still wants you. The statue path against the stats path, at
 * the only moment where the two are plainly incompatible.
 */
export const testimonialOrOneMore: Card = {
  id: 'testimonial-or-one-more',
  category: 'contract',
  kind: 'scheduled',
  beat: 'retirement',
  eligibility: (c) => c.state.player.age >= 33,
  weight: (c) => 60 + (c.state.player.age - 33) * 20,
  title: (c) => `${currentClub(c).name} want to talk about the end`,
  situation: (c) => {
    const years = seasonsAt(c.state, c.state.clubId);
    const affection = standingAt(c.state, c.state.clubId);
    const warmth = affection >= 70 ? 'The supporters would fill it' : 'They would sell most of it';
    return `The chief executive has used the word testimonial twice and the word squad once. You have been here ${years} ${years === 1 ? 'season' : 'seasons'}. ${warmth}. Meanwhile your agent has a club two divisions down who will pay you to play every week for two more years.`;
  },
  options: (c) => [
    {
      id: 'testimonial',
      label: () => `Take the testimonial at ${currentClub(c).name}`,
      detail: () => 'Finish here, in front of them, with the badge on. No more football after that.',
      effects: () => [
        {
          kind: 'immediate',
          change: {
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingTestimonial },
            reputation: T.reputationGainShowcase / 2,
          },
        },
        { kind: 'retire' },
      ],
    },
    {
      id: 'one-more-here',
      label: () => 'One more year here, whatever the role',
      detail: () => 'A squad number and not much else, but the years served keep adding up.',
      effects: () => [
        {
          kind: 'immediate',
          change: {
            contractYears: T.contractYearsFinal,
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
            wage: T.wageCutLoyalty,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesPenaltyVeteranRole, seasons: 2, label: 'Kept on out of respect' },
        },
      ],
    },
    {
      id: 'drop-down-and-play',
      label: () => 'Drop down and play every week',
      detail: () => 'Two years of actual football somewhere nobody is watching.',
      effects: () => [
        {
          kind: 'immediate',
          change: {
            contractYears: T.contractYearsShort,
            clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingAgitationPenalty },
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesBonusRegularFootball, seasons: 3, label: 'Playing every week' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'standing', value: T.standingSupportersBacking, seasons: 3, label: 'Big fish, small pond' },
        },
        { kind: 'immediate', change: { reputation: -T.reputationLossInvisibleLeague / 2 } },
      ],
    },
  ],
};

/** True when the club he is at is clearly a step up from where he belongs. */
export function isAtGiant(c: import('../types').Ctx): boolean {
  return clubStrength(c.state.world, c.state.clubId) - c.state.player.ovr >= 6;
}

export const contractCards = [firstContract, testimonialOrOneMore];
export { currentLeague };

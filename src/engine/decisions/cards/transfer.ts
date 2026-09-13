import { clubLeagueId, clubStrength } from '../../league';
import { TUNABLES as T } from '../tunables';
import type { Card, Effect } from '../types';
import { buildOffer } from '../../transfers';
import { bestOfferIndex, currentClub, lastSeason, money, mostMinutesIndex, offersFor } from './helpers';

/**
 * The bench at a giant.
 *
 * The development trap the brief calls the most interesting decision in the
 * game. The club is not lying — they do want him, they will pay him, and he
 * will not play. Phase 2's minutes gate does the rest.
 */
export const benchAtGiant: Card = {
  id: 'bench-at-a-giant',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  // Rare on purpose: a giant coming in is the event of a career, and if it
  // happens every other season everybody ends up in the big five.
  eligibility: (c) =>
    c.state.player.age <= 26 &&
    (c.subject.offers?.length ?? 0) > 0 &&
    c.state.player.reputation >= 38 &&
    (lastSeason(c)?.minutes ?? 0) >= 1500,
  weight: (c) => (c.state.player.age <= 23 ? 34 : 16),
  prepare: (state, world, rng) => {
    // Built directly rather than drawn from the ordinary market: a giant coming
    // in for a player who is not ready is exactly the offer the normal
    // plausibility filters exist to reject.
    const candidates = world.data.clubs.filter((club) => {
      const strength = clubStrength(state.world, club.id);
      if (club.id === state.clubId) return false;
      return club.prestige >= 74 && strength - state.player.ovr >= 6 && strength - state.player.ovr <= 22;
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (c) => c.prestige / 40);
    return { offers: [buildOffer(rng, state, world, club.id)] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} have made an offer` : 'An offer from above';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A bigger club have been in touch.';
    const club = currentClub(c);
    const role = offer.role === 'fringe' || offer.role === 'squad' ? 'squad player' : 'rotation option';
    return `${offer.clubName} have agreed a fee with ${club.name} and will pay you ${money(offer.wage)} a year. Their sporting director was careful on the phone: he used the phrase ${role} and he did not use the phrase first choice. You are ${c.state.player.age}, and you are playing every week where you are.`;
  },
  options: (c) => {
    const offer = c.subject.offers?.[0];
    return [
      {
        id: 'take-it',
        label: () => (offer ? `Sign for ${offer.clubName}` : 'Take the move'),
        detail: () => 'The badge, the money, the training ground. Whatever the minutes turn out to be.',
        effects: (): Effect[] => [
          { kind: 'transfer', offerIndex: 0, reason: 'ambition' },
          {
            kind: 'modifier',
            modifier: {
              channel: 'minutes',
              value: T.minutesPenaltyBenchSeason,
              seasons: 2,
              label: 'Behind an international in that position',
            },
          },
          {
            kind: 'modifier',
            modifier: {
              channel: 'development',
              value: T.developmentPenaltyBenchSeason,
              seasons: 2,
              label: 'Training well, playing rarely',
            },
          },
          // The shop window at a club everyone watches, whether he plays or not.
          {
            kind: 'immediate',
            change: { reputation: T.reputationGainShowcase, marketValue: T.marketValueBumpShopWindow },
          },
          {
            kind: 'delayed',
            seasons: T.delayShort,
            label: 'Two years in, and it goes one way or the other',
            effects: [
              {
                kind: 'probabilistic',
                chance: T.giantBreakthroughChance,
                label: 'You force your way in, and now you are a starter for one of the best sides in Europe',
                then: [
                  {
                    kind: 'modifier',
                    modifier: { channel: 'minutes', value: T.minutesBonusFirstChoiceGiant, seasons: 5, label: 'First choice at a giant' },
                  },
                  {
                    kind: 'modifier',
                    modifier: { channel: 'standing', value: T.standingSupportersBacking, seasons: 5, label: 'One of their own now' },
                  },
                  {
                    kind: 'immediate',
                    change: {
                      reputation: T.reputationGainShowcase,
                      marketValue: T.marketValueBumpBreakthrough,
                      clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyLarge },
                    },
                  },
                ],
                otherwise: [
                  { kind: 'immediate', change: { marketValue: T.marketValueDropStagnation, managerRelationship: -T.managerTrustLoss, form: -T.moraleHitLarge } },
                  {
                    kind: 'modifier',
                    modifier: { channel: 'minutes', value: T.minutesPenaltySlight, seasons: 2, label: 'Still nowhere near the side' },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'stay-and-play',
        label: () => `Stay at ${currentClub(c).name}`,
        detail: () => 'Another season of actually playing, at a club nobody is watching closely.',
        effects: (): Effect[] => [
          { kind: 'stay' },
          {
            kind: 'immediate',
            change: {
              clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
              managerRelationship: T.managerTrustGain,
            },
          },
          {
            kind: 'modifier',
            modifier: { channel: 'minutes', value: T.minutesBonusTrusted, seasons: 3, label: 'The manager built the side round you' },
          },
          {
            kind: 'delayed',
            seasons: T.delayLong,
            label: 'The window that was open at 21 has quietly closed',
            effects: [
              {
                kind: 'immediate',
                change: { marketValue: T.marketValueDropForgotten, reputation: -T.reputationLossInvisibleLeague / 1.5 },
              },
            ],
          },
        ],
      },
    ];
  },
};

/**
 * Loan or fight for it. Minutes against standing, and the standing matters
 * because the manager notices who asked to leave.
 */
export const loanOrFight: Card = {
  id: 'loan-or-fight',
  category: 'loan',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  eligibility: (c) => {
    const last = lastSeason(c);
    return c.state.player.age <= 23 && (c.subject.offers?.length ?? 0) > 0 && (last?.minutes ?? 0) < 1400;
  },
  weight: () => 80,
  prepare: (state, world, rng) => ({
    offers: offersFor(state, world, rng, { includeLoans: true })
      .filter((o) => o.loan || clubStrength(state.world, o.clubId) < clubStrength(state.world, state.clubId))
      .slice(0, 1),
  }),
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} want you on loan` : 'A loan on the table';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    const last = lastSeason(c);
    const mins = last?.minutes ?? 0;
    if (!offer) return 'A loan has been suggested.';
    return `You played ${mins} minutes last season and you are not in the manager's first eleven. ${offer.clubName} have been on all week and their manager has told your agent you would start. Staying means a pre-season of trying to change a mind that has already been made up.`;
  },
  options: (c) => {
    const offer = c.subject.offers?.[0];
    return [
      {
        id: 'go-on-loan',
        label: () => (offer ? `Go to ${offer.clubName}` : 'Take the loan'),
        detail: () => 'A season of first-team football somewhere else, and a season away from here.',
        effects: (): Effect[] => [
          { kind: 'transfer', offerIndex: 0, reason: 'loan' },
          {
            kind: 'modifier',
            modifier: { channel: 'minutes', value: T.minutesBonusLoanRegular, seasons: 2, label: 'First choice on loan' },
          },
          {
            kind: 'modifier',
            modifier: { channel: 'development', value: T.developmentBonusFocused, seasons: 2, label: 'Playing men’s football' },
          },
          {
            kind: 'immediate',
            change: { clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub } },
          },
        ],
      },
      {
        id: 'stay-and-fight',
        label: () => `Stay and fight for it at ${currentClub(c).name}`,
        detail: () => 'Pre-season is long and the man ahead of you is not getting younger.',
        effects: (): Effect[] => [
          { kind: 'stay' },
          {
            kind: 'immediate',
            change: {
              clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus / 2 },
              wear: T.wearFromHardPreSeason,
            },
          },
          {
            kind: 'probabilistic',
            chance: T.promiseKeptChance,
            label: 'You win the shirt in pre-season',
            then: [
              {
                kind: 'modifier',
                modifier: { channel: 'minutes', value: T.minutesBonusRegularFootball, seasons: 4, label: 'Won the shirt' },
              },
              {
                kind: 'modifier',
                modifier: { channel: 'standing', value: T.standingManagersMan, seasons: 4, label: 'Came through it' },
              },
              {
                kind: 'immediate',
                change: {
                  managerRelationship: T.managerTrustLarge,
                  clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
                },
              },
            ],
            otherwise: [
              {
                kind: 'modifier',
                modifier: { channel: 'minutes', value: T.minutesPenaltyFrozenOut, seasons: 2, label: 'Still not in the side' },
              },
              {
                kind: 'modifier',
                modifier: { channel: 'development', value: T.developmentPenaltyBenchSeason, seasons: 2, label: 'A year in the reserves' },
              },
              { kind: 'immediate', change: { form: -T.moraleHitLarge } },
            ],
          },
        ],
      },
    ];
  },
};

/**
 * The Gulf. Money against visibility, and visibility is caps — phase 2's
 * call-up model reads league prestige directly, so this genuinely ends
 * international careers.
 */
export const gulfMove: Card = {
  id: 'agent-wants-gulf',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  eligibility: (c) => (c.subject.offers?.length ?? 0) > 0 && c.state.player.age >= 26,
  weight: (c) => (c.state.player.age >= 29 ? 70 : 30),
  prepare: (state, world, rng) => {
    const offers = offersFor(state, world, rng).filter((o) => {
      const league = world.league(clubLeagueId(state.world, o.clubId));
      return league.prestige <= 62 && o.wage > state.wage * 1.4;
    });
    // A long deal, because the whole point is that the money accumulates.
    return { offers: offers.slice(0, 1).map((o) => ({ ...o, contractYears: Math.max(3, o.contractYears) })) };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} have tripled the offer` : 'The money is elsewhere';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'Your agent has a number for you.';
    const capped = c.state.national.caps > 0;
    void capped;
    const tail =
      c.state.national.caps > 0
        ? `The national team manager does not travel to watch ${offer.leagueName}.`
        : `You have never been capped, and nobody gets a first call-up from ${offer.leagueName}.`;
    return `Your agent rang at eleven at night, which he does not normally do. ${offer.clubName} will pay ${money(offer.wage)} a year, tax free, on a ${offer.contractYears}-year deal, and the medical is a formality. ${tail}`;
  },
  options: (c) => {
    const offer = c.subject.offers?.[0];
    return [
      {
        id: 'take-the-money',
        label: () => (offer ? `Sign for ${offer.clubName}` : 'Take the money'),
        detail: () => 'Generational money, and a league nobody you know will watch.',
        effects: (): Effect[] => [
          { kind: 'transfer', offerIndex: 0, reason: 'money' },
          {
            kind: 'immediate',
            change: {
              wage: T.wageUpliftGulf,
              reputation: -T.reputationLossInvisibleLeague,
              clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingMercenaryPenalty },
            },
          },
          {
            kind: 'probabilistic',
            chance: T.gulfCallUpSurvivalChance,
            label: 'The national manager keeps picking you anyway',
            then: [{ kind: 'immediate', change: { nationalStanding: T.nationalStandingGain / 2 } }],
            otherwise: [{ kind: 'immediate', change: { nationalStanding: -T.nationalStandingLoss } }],
          },
          {
            kind: 'delayed',
            seasons: T.delayShort,
            label: 'Two years in and the European clubs have stopped calling',
            effects: [
              {
                kind: 'immediate',
                change: { marketValue: T.marketValueDropForgotten, reputation: -T.reputationLossInvisibleLeague / 2 },
              },
            ],
          },
        ],
      },
      {
        id: 'turn-it-down',
        label: () => `Stay at ${currentClub(c).name}`,
        detail: () => 'Less money, and the people who pick the national squad can still see you.',
        effects: (): Effect[] => [
          { kind: 'stay' },
          {
            kind: 'immediate',
            change: {
              clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
              nationalStanding: T.nationalStandingGain / 3,
            },
          },
        ],
      },
      {
        id: 'use-it-as-leverage',
        label: () => 'Use it to get a rise where you are',
        detail: () => 'Your club will pay to keep you. They will also know you were ready to go.',
        effects: (): Effect[] => [
          { kind: 'stay' },
          {
            kind: 'immediate',
            change: {
              wage: T.wageUpliftLarge,
              clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingAgitationPenalty },
              managerRelationship: -T.managerTrustLoss / 2,
            },
          },
          {
            kind: 'delayed',
            seasons: T.delayShort,
            label: 'Your wage is the first one they look at when the budget is cut',
            effects: [
              {
                kind: 'immediate',
                change: { clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub } },
              },
              {
                kind: 'modifier',
                modifier: { channel: 'minutes', value: T.minutesPenaltySlight, seasons: 1, label: 'Paid too much to be dropped quietly' },
              },
            ],
          },
        ],
      },
    ];
  },
};

export const transferCards = [benchAtGiant, loanOrFight, gulfMove];
export { bestOfferIndex, mostMinutesIndex };

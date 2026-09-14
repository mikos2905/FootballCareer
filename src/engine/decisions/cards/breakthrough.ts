import { clubStrength } from '../../league';
import { buildOffer, isVisibleTo } from '../../transfers';
import { TUNABLES as T } from '../tunables';
import type { Card, Effect } from '../types';
import {
  attributesBy,
  ceilingBy,
  currentClub,
  focus,
  here,
  later,
  lastSeason,
  maybe,
  mod,
  money,
  moveTo,
  now,
  stay,
} from './helpers';

/**
 * Breakthrough, nineteen to twenty-three.
 *
 * The stage where a career is actually decided. Everything here is a version of
 * the same question — do you play, and where — and the wrong answer at
 * twenty-one is a thing you find out about at twenty-six.
 */

const firstBigContract: Card = {
  id: 'first-big-contract',
  category: 'contract',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 19 && (lastSeason(c)?.minutes ?? 0) > 1200,
  weight: () => 65,
  title: (c) => `${currentClub(c).name} have torn up your contract`,
  situation: (c) =>
    `A season in the side and the club want to protect themselves. The new deal is five years at four times what you are on, which is ${money(c.state.wage * 4)}, and it is the most money anyone in your family has seen. Five years is also the rest of your twenties at ${currentClub(c).name}.`,
  options: () => [
    {
      id: 'five-years',
      label: () => 'Sign for five years',
      detail: () => 'Security, and a club who can now name their price for you.',
      effects: () => [
        now({ contractYears: T.contractYearsLong, wage: T.wageUpliftLarge, clubStanding: here(T.clubStandingLoyaltyLarge) }),
        mod('minutes', T.minutesBonusTrusted, 3, 'Their investment'),
        later(T.delayMedium, 'The club value you at whatever they feel like, and you signed for it', [
          now({ marketValue: T.marketValueDropStagnation }),
        ]),
      ],
    },
    {
      id: 'three-years',
      label: () => 'Three years, and a clause',
      detail: () => 'Less money now, and the door stays on the latch.',
      effects: () => [
        now({ contractYears: T.contractYearsStandard, wage: T.wageUpliftModest, clubStanding: here(-T.clubStandingSnub / 2) }),
        later(T.delayShort, 'The clause is exactly why the phone is ringing', [
          now({ marketValue: T.marketValueBumpTransferListed, reputation: T.reputationGainShowcase }),
        ]),
      ],
    },
    {
      id: 'wait',
      label: () => 'Tell them you want to see how the season goes',
      detail: () => 'Leverage, if you have a good one. Nothing, if you do not.',
      effects: () => [
        now({ contractYears: T.contractYearsShort, managerRelationship: -T.managerTrustLoss / 2, clubStanding: here(-T.clubStandingAgitationPenalty) }),
        maybe(T.gambleLandsChance, 'You had the season, and now you are negotiating from the front foot', [
          now({ wage: T.wageUpliftGulf / 1.5, marketValue: T.marketValueBumpBreakthrough }),
        ], [
          now({ wage: T.wageCutLoyalty, marketValue: T.marketValueDropStagnation }),
          mod('minutes', T.minutesPenaltySlight, 1, 'Not committed, not picked'),
        ]),
      ],
    },
  ],
};

const stepUpOrConsolidate: Card = {
  id: 'step-up-or-consolidate',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  eligibility: (c) => (lastSeason(c)?.minutes ?? 0) > 1600,
  weight: () => 55,
  prepare: (state, world, rng) => {
    const candidates = world.data.clubs.filter((club) => {
      const strength = clubStrength(state.world, club.id);
      return (
        club.id !== state.clubId &&
        strength - state.player.ovr >= 2 &&
        strength - state.player.ovr <= 7 &&
        isVisibleTo(state, world, club.id)
      );
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (x) => 0.5 + x.prestige / 90);
    return { offers: [buildOffer(rng, state, world, club.id)] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} have bid` : 'A step up';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A club a level above have been in touch.';
    return `Not a giant, but a level up: ${offer.clubName} finished above you and their manager has phoned your agent himself. He wants you as a starter, not a squad player, and he has told your agent which shirt. ${currentClub(c).name} would want you to stay one more year.`;
  },
  options: (c) => {
    const offer = c.subject.offers?.[0];
    return [
      {
        id: 'go',
        label: () => (offer ? `Sign for ${offer.clubName}` : 'Take the step up'),
        detail: () => 'A better level, and you have to prove it all over again.',
        effects: (c): Effect[] => [
          moveTo(0, 'ambition'),
          mod('development', T.developmentBonusEliteCoaching, 3, 'Better level, better football'),
          now(ceilingBy(c, T.ceilingOvrLarge)),
          now({ reputation: T.reputationGainShowcase / 2 }),
        ],
      },
      {
        id: 'consolidate',
        label: (x) => `Give ${currentClub(x).name} one more year`,
        detail: () => 'Another season of being the best player in the building.',
        effects: (c): Effect[] => [
          stay,
          now({ clubStanding: here(T.clubStandingLoyaltyLarge), managerRelationship: T.managerTrustGain }),
          mod('minutes', T.minutesBonusRegularFootball, 2, 'The best player here'),
          now(ceilingBy(c, -T.ceilingOvrLoss / 2)),
          later(T.delayMedium, 'That club moved on and bought somebody else', [
            now({ marketValue: T.marketValueDropStagnation }),
          ]),
        ],
      },
    ];
  },
};

const foreignLeagueEarly: Card = {
  id: 'foreign-league-early',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => (c.subject.offers?.length ?? 0) > 0 && c.state.player.age <= 23,
  weight: () => 40,
  prepare: (state, world, rng) => {
    const home = world.club(state.clubId).country;
    const candidates = world.data.clubs.filter((club) => {
      const strength = clubStrength(state.world, club.id);
      return club.country !== home && Math.abs(strength - state.player.ovr) <= 6;
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (x) => 0.5 + x.prestige / 100);
    return { offers: [buildOffer(rng, state, world, club.id)] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} want you abroad` : 'An offer from abroad';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A club abroad have been in touch.';
    return `${offer.clubName} play in ${offer.leagueName} and their sporting director flew over to watch you twice. It is a different language, a different way of training, and a flat on your own at twenty-one. Everyone you know is here.`;
  },
  options: () => [
    {
      id: 'go',
      label: () => 'Go, and be homesick for a year',
      detail: () => 'A different football education, and you will be homesick for a year.',
      effects: (): Effect[] => [
        moveTo(0, 'ambition'),
        now({ ceiling: { passing: T.ceilingGainCoaching, flair: T.ceilingGainCoaching }, form: -T.moraleHitLarge }),
        mod('development', T.developmentBonusEliteCoaching, 3, 'Learning a different game'),
        mod('minutes', T.minutesPenaltySlight, 1, 'Settling in'),
      ],
    },
    {
      id: 'stay',
      label: () => 'Stay where people speak your language',
      detail: () => 'Familiar, comfortable, and exactly the same football as last year.',
      effects: (): Effect[] => [
        stay,
        now({ form: T.moraleBoostSmall, clubStanding: here(T.clubStandingLoyaltyBonus) }),
      ],
    },
  ],
};

const loanRecall: Card = {
  id: 'loan-recall',
  category: 'loan',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  eligibility: (c) => c.state.parentClubId !== null,
  weight: () => 70,
  title: (c) => `${c.world.club(c.state.parentClubId ?? c.state.clubId).name} want you back in January`,
  situation: (c) => {
    const parent = c.world.club(c.state.parentClubId ?? c.state.clubId).name;
    return `An injury at ${parent} and they have the right to recall you. You are playing every week here and top scorer in the dressing room's opinion. Back there you would be the fourth option and training with people who are better than you.`;
  },
  options: () => [
    {
      id: 'go-back',
      label: (c) => `Go back to ${c.world.club(c.state.parentClubId ?? c.state.clubId).name}`,
      detail: () => 'The club that owns you, and the level you are trying to reach.',
      effects: (c): Effect[] => [
        now({ contractYears: 0, managerRelationship: T.managerTrustGain }),
        now(ceilingBy(c, T.ceilingOvrSmall)),
        mod('minutes', T.minutesPenaltySlight, 1, 'Back in the squad, not the side'),
        mod('development', T.developmentBonusEliteCoaching, 2, 'Training at the higher level'),
      ],
    },
    {
      id: 'see-it-out',
      label: () => 'Ask to see the loan out',
      detail: () => 'Six more months of playing. They will find someone else for the gap.',
      effects: (c): Effect[] => [
        mod('minutes', T.minutesBonusRegularFootball, 2, 'Playing every week'),
        now(attributesBy(c, T.attributeOvrSmall)),
        now({ managerRelationship: -T.managerTrustLoss }),
        later(T.delayShort, 'The club that owns you made other plans while you were away', [
          mod('minutes', T.minutesPenaltyReserves, 1, 'Came back to a closed door'),
        ]),
      ],
    },
  ],
};

const dressingRoomClique: Card = {
  id: 'dressing-room-clique',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  eligibility: (c) => (lastSeason(c)?.minutes ?? 0) > 900,
  weight: () => 45,
  title: () => 'There are two dressing rooms here',
  situation: (c) =>
    `Half the squad at ${currentClub(c).name} think the manager has lost it and say so at lunch. The other half are his signings. You have been at the club long enough that both sides assume you agree with them, and short enough that neither has asked.`,
  options: () => [
    {
      id: 'players',
      label: () => 'Side with the players',
      detail: () => 'The dressing room closes round you. The manager picks the team.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyBonus), managerRelationship: -T.managerTrustLoss }),
        mod('minutes', T.minutesPenaltySlight, 2, 'On the wrong side of it'),
        maybe(T.managerSackedChance, 'The manager goes, and the lads remember who stood where', [
          now({ clubStanding: here(T.clubStandingLoyaltyLarge) }),
          mod('minutes', T.minutesBonusCleanSlate, 2, 'The new man asked the senior players'),
        ]),
      ],
    },
    {
      id: 'manager',
      label: () => 'Side with the manager',
      detail: () => 'He picks the team. They are in it with you every day.',
      effects: () => [
        now({ managerRelationship: T.managerTrustLarge, clubStanding: here(-T.clubStandingSnub) }),
        mod('minutes', T.minutesBonusRegularFootball, 2, "The manager's man"),
        maybe(T.managerSackedChance, 'He is sacked in March and you are his player', [
          mod('minutes', T.minutesPenaltyReserves, 2, 'Tied to the last regime'),
        ]),
      ],
    },
    {
      id: 'neither',
      label: () => 'Say nothing to anybody',
      detail: () => 'Train, play, go home. Nobody trusts you and nobody blames you.',
      effects: () => [now({ form: -T.moraleHitSmall }), mod('standing', -2, 3, 'Kept your head down')],
    },
  ],
};

const publicCriticism: Card = {
  id: 'public-criticism',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  eligibility: (c) => (lastSeason(c)?.averageRating ?? 0) < 6.6,
  weight: () => 28,
  title: () => 'He named you in the press conference',
  situation: (c) =>
    `Not a general point about the team. Your name, the goal, and the phrase "not at the level". It is on every phone in the building by the time you get to the car park, and a reporter is waiting by the barrier at ${currentClub(c).name} to ask how you feel about it.`,
  options: () => [
    {
      id: 'nothing',
      label: () => 'Walk past the reporter',
      detail: () => 'Answer it on Saturday or do not answer it at all.',
      effects: () => [
        now({ form: -T.moraleHitLarge }),
        maybe(T.likelyChance, 'You answer it on the pitch and he says so, publicly', [
          now({ managerRelationship: T.managerTrustLarge, clubStanding: here(T.clubStandingLoyaltyBonus) }),
        ], [now({ managerRelationship: -T.managerTrustLoss })]),
      ],
    },
    {
      id: 'answer',
      label: () => 'Answer it',
      detail: () => 'The supporters will like it. He will not.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyLarge), managerRelationship: -T.managerTrustCollapse, reputation: T.reputationGainCaptain }),
        mod('minutes', T.minutesPenaltyFrozenOut, 2, 'Answered the manager back in public'),
      ],
    },
    {
      id: 'private',
      label: () => 'Knock on his door on Monday',
      detail: () => 'Have it out where there is nobody to perform for.',
      effects: () => [
        now({ managerRelationship: T.managerTrustGain }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Cleared the air'),
        now({ form: -T.moraleHitSmall }),
      ],
    },
  ],
};

const specialistCoach: Card = {
  id: 'specialist-coach',
  category: 'training',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  eligibility: (c) => c.state.player.age <= 26,
  weight: () => 45,
  title: () => 'A specialist has offered to work with you',
  situation: (c) =>
    `He worked with two internationals, he charges what you earn in a month, and he wants two mornings a week away from ${currentClub(c).name}'s training ground. The club's own staff have made it clear they think it is a waste of money and a slight on them.`,
  options: () => [
    {
      id: 'hire',
      label: () => 'Pay for him yourself',
      detail: () => 'Your money, your mornings, and the club staff will hear about it.',
      effects: (c) => [
        now({ wage: T.wageCutSmall, managerRelationship: -T.managerTrustLoss / 2 }),
        now(ceilingBy(c, T.ceilingOvrLarge)),
        focus(['shooting', 'dribbling'], 3, 'Specialist work'),
      ],
    },
    {
      id: 'club',
      label: () => 'Work with the club staff instead',
      detail: () => 'They are not as good. They are also the ones who talk to the manager.',
      effects: (c) => [
        now({ managerRelationship: T.managerTrustGain }),
        now(ceilingBy(c, T.ceilingOvrSmall)),
        mod('minutes', T.minutesBonusTrusted, 2, 'In with the coaching staff'),
      ],
    },
  ],
};

const firstSeriousInjury: Card = {
  id: 'first-serious-injury',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  eligibility: (c) => (c.state.seasons.at(-1)?.matchesMissed ?? 0) >= 10,
  weight: () => 60,
  title: () => 'The surgeon has given you two options',
  situation: () =>
    `A clean repair takes nine months and comes back at ninety-five per cent. A tidy-up takes eleven weeks and comes back at eighty, with the same conversation likely again in three years. He says most players your age take the eleven weeks and most surgeons wish they would not.`,
  options: () => [
    {
      id: 'full',
      label: () => 'Take the nine months',
      detail: () => 'Most of a season gone, and the knee is the knee you had before.',
      effects: () => [
        mod('minutes', T.minutesPenaltyInjured, 2, 'Long rehabilitation'),
        mod('development', T.developmentPenaltyBenchSeason, 2, 'A year without football'),
        now({ wear: T.wearFromPlayingInjured, injuryProneness: -T.pronenessRelief }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 6, 'Repaired properly'),
      ],
    },
    {
      id: 'quick',
      label: () => 'Take the eleven weeks',
      detail: () => 'Back for the run-in. The surgeon did not look pleased.',
      effects: () => [
        mod('minutes', T.minutesPenaltySlight, 1, 'Back early'),
        now({ injuryProneness: T.injuryPronenessFromPlayingInjured, attributes: { pace: -T.attributeLossSmall } }),
        later(T.delayMedium, 'The knee you rushed back on has gone again', [
          now({ attributes: { pace: -T.attributeLossSmall, physical: -T.attributeLossSmall }, injuryProneness: 8 }),
          mod('injuryRisk', 1.4, 4, 'A knee that never came right'),
        ]),
      ],
    },
  ],
};

const moneyAndAttention: Card = {
  id: 'money-and-attention',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.wage > 400_000,
  weight: () => 50,
  title: () => 'Everyone you grew up with wants something',
  situation: (c) =>
    `Your cousin has a business idea. Two lads from school want tickets every week. Somebody you have not spoken to since you were fourteen has asked for a loan, in writing, with a figure. You are twenty-one and earning ${money(c.state.wage)} a year and none of it was explained to you.`,
  options: () => [
    {
      id: 'generous',
      label: () => 'Look after everyone',
      detail: () => 'It is only money, and they were there before any of this.',
      effects: () => [
        now({ wage: 0.85, form: T.moraleBoostLarge, reputation: T.reputationGainCaptain }),
      ],
    },
    {
      id: 'firm',
      label: () => 'Say no and mean it',
      detail: () => 'Cleaner. You will lose some of them over it.',
      effects: () => [
        now({ form: -T.moraleHitLarge }),
        mod('development', T.developmentBonusFocused, 2, 'Nothing outside football'),
      ],
    },
    {
      id: 'manager',
      label: () => 'Put someone in between you and it',
      detail: () => 'A person whose job is to say no, so you do not have to.',
      effects: () => [
        now({ wage: 0.95 }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 3, 'Life in order'),
        later(T.delayMedium, 'The man handling your money has handled rather a lot of it', [
          now({ marketValue: 0.95, wage: 0.92 }),
        ]),
      ],
    },
  ],
};

const u21OrSeniors: Card = {
  id: 'u21-or-seniors',
  category: 'international',
  kind: 'opportunistic',
  stages: ['breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 19 && c.state.player.age <= 23,
  weight: () => 55,
  title: (c) => `${c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name} have two squads and you are on both lists`,
  situation: (c) => {
    const nation = c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name;
    return `The under-21s have a tournament and you would captain them. The senior squad have named you as a standby, which means three weeks of training and probably no minutes. ${nation}'s manager has not spoken to you directly about either.`;
  },
  options: () => [
    {
      id: 'seniors',
      label: () => 'Go with the seniors and carry the bags',
      detail: () => 'Training with better players, and possibly not getting on the pitch.',
      effects: () => [
        now({ nationalStanding: T.nationalStandingGainLarge, reputation: T.reputationGainShowcase / 2, wear: T.wearFromHardPreSeason }),
        mod('development', T.developmentBonusEliteCoaching, 2, 'Training with internationals'),
      ],
    },
    {
      id: 'u21',
      label: () => 'Captain the under-21s',
      detail: () => 'Games, an armband, and a tournament nobody senior will watch.',
      effects: () => [
        now({ form: T.moraleBoostLarge, reputation: T.reputationGainCaptain }),
        mod('standing', T.standingCaptain, 4, 'Captained his country at a tournament'),
        now({ nationalStanding: -T.nationalStandingLossLarge / 2 }),
      ],
    },
  ],
};

const firstClubWantsYouBack: Card = {
  id: 'first-club-wants-you-back',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  oncePerCareer: true,
  eligibility: (c) =>
    c.state.clubStandings.length > 1 && c.state.clubStandings.some((s) => s.clubId !== c.state.clubId && s.seasonsServed >= 2),
  weight: () => 35,
  prepare: (state, world, rng) => {
    const home = state.clubStandings.find((s) => s.clubId !== state.clubId && s.seasonsServed >= 2);
    if (!home) return { offers: [] };
    return { offers: [buildOffer(rng, state, world, home.clubId, { contractYears: 4 })], clubId: home.clubId };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} want you back` : 'The old club have been in touch';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A club you used to play for have been in touch.';
    return `${offer.clubName} have had a bad two years and their new manager wants players who know what the place means. It is a step down and everybody would understand if you said no. The message came from the kit man, which tells you who put him up to it.`;
  },
  options: () => [
    {
      id: 'go-back',
      label: (c) => `Go back to ${c.subject.offers?.[0]?.clubName ?? 'them'}`,
      detail: () => 'A smaller stage, and a place where they already love you.',
      effects: (): Effect[] => [
        moveTo(0, 'loyalty'),
        now({ clubStanding: here(T.clubStandingLoyaltyLarge) }),
        mod('standing', T.standingBigFishSmallPond, 5, 'One of their own, come home'),
        mod('minutes', T.minutesBonusRegularFootball, 3, 'Built the side round him'),
      ],
    },
    {
      id: 'not-yet',
      label: () => 'Tell them not yet',
      detail: () => 'There is a career to have first. They will still be there.',
      effects: (): Effect[] => [stay, now({ form: -T.moraleHitSmall })],
    },
  ],
};

const socialMedia: Card = {
  id: 'social-media',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['breakthrough', 'prime'],
  eligibility: (c) => c.state.player.reputation >= 25,
  weight: () => 35,
  title: () => 'Something you posted at nineteen has resurfaced',
  situation: (c) =>
    `It is not career-ending and it is not defensible either. The club's press officer wants a statement by six. Your agent wants you to say nothing. A supporters' account with forty thousand followers has already decided what you are, and ${currentClub(c).name} play away on Saturday.`,
  options: () => [
    {
      id: 'apologise',
      label: () => 'Apologise properly and say nothing else',
      detail: () => 'It goes away in a week and follows you for a decade.',
      effects: () => [
        now({ reputation: -T.reputationGainShowcase / 2, clubStanding: here(-T.clubStandingSnub / 2) }),
        mod('minutes', T.minutesBonusTrusted, 1, 'Handled it properly'),
      ],
    },
    {
      id: 'ignore',
      label: () => 'Post nothing at all',
      detail: () => 'Let it burn out. The club will not enjoy the week.',
      effects: () => [
        now({ managerRelationship: -T.managerTrustLoss, form: -T.moraleHitLarge }),
        maybe(T.likelyChance, 'It burns out in nine days and nobody mentions it again', [], [
          now({ clubStanding: here(-T.clubStandingAgitationPenalty), reputation: -T.reputationGainShowcase }),
        ]),
      ],
    },
  ],
};

export const breakthroughCards = [
  firstBigContract,
  stepUpOrConsolidate,
  foreignLeagueEarly,
  loanRecall,
  dressingRoomClique,
  publicCriticism,
  specialistCoach,
  firstSeriousInjury,
  moneyAndAttention,
  u21OrSeniors,
  firstClubWantsYouBack,
  socialMedia,
];

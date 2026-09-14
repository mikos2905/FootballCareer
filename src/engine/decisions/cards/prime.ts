import { clubStrength } from '../../league';
import { buildOffer, isVisibleTo } from '../../transfers';
import { TUNABLES as T } from '../tunables';
import type { Card, Effect } from '../types';
import { currentClub, here, later, maybe, mod, money, moveTo, now, seasonsAt, standingAt, stay } from './helpers';

/**
 * Prime, twenty-three to thirty.
 *
 * The years where both win conditions are live at once, and almost every card
 * here is a version of choosing between them. Money and medals are somewhere
 * else; the statue is here.
 */

const peakNegotiation: Card = {
  id: 'peak-negotiation',
  category: 'contract',
  kind: 'opportunistic',
  stages: ['prime'],
  eligibility: (c) => c.state.contractYearsRemaining <= 2 && c.state.player.age >= 24,
  weight: () => 30,
  title: (c) => `${currentClub(c).name} want to extend`,
  situation: (c) =>
    `You are twenty-${c.state.player.age - 20} and on ${money(c.state.wage)}. The club have opened at the same money for three more years, which your agent describes on the phone as an insult and the club describe as respecting the structure. Two clubs above you in the table are said to be watching.`,
  options: () => [
    {
      id: 'sign-quietly',
      label: () => 'Sign it without a fuss',
      detail: () => 'Below your market. The building will know you did it.',
      effects: () => [
        now({ contractYears: T.contractYearsStandard, clubStanding: here(T.clubStandingLoyaltyLarge), managerRelationship: T.managerTrustLarge }),
        mod('standing', T.standingManagersMan, 5, 'Signed without a fuss'),
      ],
    },
    {
      id: 'market-rate',
      label: () => 'Hold out for the market rate',
      detail: () => 'What you are worth, from people who now know what you think you are worth.',
      effects: () => [
        now({ contractYears: T.contractYearsStandard, wage: T.wageUpliftLarge, clubStanding: here(-T.clubStandingAgitationPenalty) }),
        later(T.delayShort, 'Yours is the first wage they look at when the budget is cut', [
          mod('minutes', T.minutesPenaltySlight, 1, 'Paid too much to be picked quietly'),
        ]),
      ],
    },
    {
      id: 'run-down',
      label: () => 'Let it run to the last year',
      detail: () => 'Everything on the table next summer, and nothing guaranteed before it.',
      effects: () => [
        now({ contractYears: T.contractYearsShort, clubStanding: here(-T.clubStandingMercenaryPenalty / 2), marketValue: T.marketValueDropStagnation }),
        later(T.delayShort, 'Out of contract, and the whole of Europe knows it', [
          now({ contractYears: 0, marketValue: T.marketValueBumpTransferListed }),
        ]),
      ],
    },
  ],
};

const championsLeagueMove: Card = {
  id: 'champions-league-move',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['prime'],
  eligibility: (c) => c.state.player.age >= 23 && c.state.player.reputation >= 40,
  weight: () => 50,
  prepare: (state, world, rng) => {
    const candidates = world.data.clubs.filter((club) => {
      const league = world.league(state.world.clubs[club.id]?.leagueId ?? club.leagueId);
      const strength = clubStrength(state.world, club.id);
      return (
        club.id !== state.clubId &&
        league.continental === 'elite' &&
        club.prestige >= 72 &&
        isVisibleTo(state, world, club.id) &&
        strength - state.player.ovr >= -4 &&
        strength - state.player.ovr <= 10
      );
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (x) => x.prestige / 50);
    return { offers: [buildOffer(rng, state, world, club.id)] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} and European football` : 'A move for the medals';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    const years = seasonsAt(c.state, c.state.clubId);
    if (!offer) return 'A club in Europe want you.';
    return `${offer.clubName} are in the Champions League and you are not. You have been at ${currentClub(c).name} ${years} ${years === 1 ? 'season' : 'seasons'} and the supporters sing about you. Their offer is ${money(offer.wage)} and a squad with two internationals in your position.`;
  },
  options: (c) => {
    const offer = c.subject.offers?.[0];
    return [
      {
        id: 'go',
        label: () => (offer ? `Sign for ${offer.clubName}` : 'Go for the medals'),
        detail: () => 'The competition everybody remembers, and a shirt you have to win.',
        effects: (): Effect[] => [
          moveTo(0, 'ambition'),
          now({ reputation: T.reputationGainShowcase, marketValue: T.marketValueBumpShopWindow }),
          mod('minutes', T.minutesPenaltySlight, 1, 'Settling into a better squad'),
        ],
      },
      {
        id: 'stay',
        label: () => `Stay at ${currentClub(c).name}`,
        detail: () => 'No medals, and a place where you will never have to introduce yourself.',
        effects: (): Effect[] => [
          stay,
          now({ clubStanding: here(T.clubStandingLoyaltyLarge) }),
          mod('standing', T.standingOneOfTheirOwn, 5, 'Turned down Europe to stay'),
          mod('minutes', T.minutesBonusRegularFootball, 3, 'The side is built round him'),
        ],
      },
    ];
  },
};

const rivalClubOffer: Card = {
  id: 'rival-club-offer',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  oncePerCareer: true,
  eligibility: (c) => currentClub(c).rivalId !== null && standingAt(c.state, c.state.clubId) >= 45,
  weight: () => 45,
  prepare: (state, world, rng) => {
    const rivalId = world.club(state.clubId).rivalId;
    if (!rivalId) return { offers: [] };
    return { offers: [buildOffer(rng, state, world, rivalId, { contractYears: 4 })], rivalClubId: rivalId };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName}. Of all of them.` : 'The rivals have made an offer';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'The club across the city want you.';
    const standing = standingAt(c.state, c.state.clubId);
    const feeling = standing >= 70 ? 'They love you here' : 'They have taken to you here';
    return `${offer.clubName} have bid and they are offering ${money(offer.wage)}, which is most of a percent of what ${currentClub(c).name} would ever pay. ${feeling}. There is a mural of a player who did this in 1991 and it gets repainted every year with a different word on it.`;
  },
  options: (c) => [
    {
      id: 'cross',
      label: () => `Sign for ${c.subject.offers?.[0]?.clubName ?? 'them'}`,
      detail: () => 'The money and the better side. You can never come back.',
      effects: (): Effect[] => [
        moveTo(0, 'money'),
        now({ clubStanding: here(-T.clubStandingMercenaryPenalty * 2), wage: T.wageUpliftLarge, reputation: T.reputationGainShowcase }),
      ],
    },
    {
      id: 'refuse',
      label: () => `Refuse, publicly`,
      detail: () => 'Say it on camera so there is no doubt. The money goes away for good.',
      effects: (): Effect[] => [
        stay,
        now({ clubStanding: here(T.clubStandingTestimonial), reputation: T.reputationGainCaptain }),
        mod('standing', T.standingSupportersBacking, 6, 'Turned down the rivals in public'),
      ],
    },
    {
      id: 'quiet',
      label: () => 'Turn it down without saying anything',
      detail: () => 'No statement, no mural, no drama.',
      effects: (): Effect[] => [stay, now({ clubStanding: here(T.clubStandingLoyaltyBonus) })],
    },
  ],
};

const signForLife: Card = {
  id: 'sign-for-life',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['prime'],
  oncePerCareer: true,
  eligibility: (c) => seasonsAt(c.state, c.state.clubId) >= 4 && standingAt(c.state, c.state.clubId) >= 60,
  weight: () => 50,
  title: (c) => `${currentClub(c).name} have offered you the rest of your career`,
  situation: (c) => {
    const years = seasonsAt(c.state, c.state.clubId);
    return `Six years, a coaching role at the end of it, and the chairman used the word "forever" twice in a meeting that was supposed to be about a contract. You have been here ${years} seasons. Your agent has pointed out, correctly, that you will never test what you are worth.`;
  },
  options: () => [
    {
      id: 'sign',
      label: () => 'Sign it',
      detail: () => 'This is where it ends now, whatever happens after.',
      effects: () => [
        now({ contractYears: 6, wage: T.wageCutLoyalty, clubStanding: here(T.clubStandingTestimonial) }),
        mod('standing', T.standingOneOfTheirOwn, 8, 'Signed for life'),
        mod('minutes', T.minutesBonusTrusted, 6, 'Untouchable here'),
        later(T.delayLong, 'You are thirty and you have never once been paid what you are worth', [
          now({ marketValue: T.marketValueDropForgotten }),
        ]),
      ],
    },
    {
      id: 'four',
      label: () => 'Four years, and see',
      detail: () => 'Long enough to matter here, short enough to leave.',
      effects: () => [
        now({ contractYears: T.contractYearsStandard, clubStanding: here(T.clubStandingLoyaltyBonus) }),
      ],
    },
    {
      id: 'decline',
      label: () => 'Tell them you cannot promise that',
      detail: () => 'Honest, and it will be in the papers by Thursday.',
      effects: () => [
        now({ clubStanding: here(-T.clubStandingAgitationPenalty), marketValue: T.marketValueBumpShopWindow }),
        mod('minutes', T.minutesPenaltySlight, 1, 'A player who might leave'),
      ],
    },
  ],
};

const seniorRevolt: Card = {
  id: 'senior-revolt',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['prime'],
  eligibility: (c) => standingAt(c.state, c.state.clubId) >= 40,
  weight: () => 45,
  title: () => 'The senior players want you in the meeting',
  situation: (c) =>
    `Four of them are going to the chairman about the manager on Thursday and they want you there, because you are the one the supporters listen to. The manager has picked you every week for two years. ${currentClub(c).name} have lost six of eight.`,
  options: () => [
    {
      id: 'go',
      label: () => 'Go to the meeting',
      detail: () => 'The squad will know you went. So, eventually, will he.',
      effects: () => [
        maybe(T.managerSackedChance, 'He is gone inside a fortnight', [
          now({ clubStanding: here(T.clubStandingLoyaltyBonus) }),
          mod('minutes', T.minutesBonusCleanSlate, 3, 'The new manager owes the senior players'),
        ], [
          now({ managerRelationship: -T.managerTrustCollapse }),
          mod('minutes', T.minutesPenaltyFrozenOut, 2, 'He found out who went'),
        ]),
      ],
    },
    {
      id: 'refuse',
      label: () => 'Refuse and tell them why',
      detail: () => 'He has been straight with you. You are not doing it behind his back.',
      effects: () => [
        now({ managerRelationship: T.managerTrustLarge, clubStanding: here(-T.clubStandingSnub * 1.6) }),
        mod('minutes', T.minutesBonusRegularFootball, 3, 'The one he can rely on'),
      ],
    },
    {
      id: 'warn',
      label: () => 'Tell the manager it is happening',
      detail: () => 'He gets a week to save himself. The dressing room will work out who told him.',
      effects: () => [
        now({ managerRelationship: T.managerTrustLarge, clubStanding: here(-T.clubStandingAgitationPenalty) }),
        mod('standing', -4, 4, 'The dressing room knows who talks'),
        mod('minutes', T.minutesBonusTrusted, 3, 'Protected by the manager'),
      ],
    },
  ],
};

const mentorYoungster: Card = {
  id: 'mentor-youngster',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  eligibility: (c) => c.state.player.age >= 26,
  weight: () => 40,
  title: () => 'There is a seventeen-year-old in your position',
  situation: (c) =>
    `He is the best thing to come out of ${currentClub(c).name}'s academy in a decade and he plays where you play. The coaching staff have asked you to take him under your wing, which is a thing people ask without hearing what they are asking.`,
  options: () => [
    {
      id: 'help',
      label: () => 'Teach him everything',
      detail: () => 'He will be better for it, and sooner.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyLarge), managerRelationship: T.managerTrustGain }),
        mod('standing', T.standingManagersMan, 5, 'The one who brings the kids on'),
        later(T.delayMedium, 'The boy you taught has taken your shirt', [
          mod('minutes', T.minutesPenaltySlight, 3, 'Behind the boy he trained'),
        ]),
      ],
    },
    {
      id: 'compete',
      label: () => 'Treat him like a rival, because he is',
      detail: () => 'Nothing given away. The staff will notice that too.',
      effects: () => [
        now({ managerRelationship: -T.managerTrustLoss / 2, clubStanding: here(-T.clubStandingSnub) }),
        mod('minutes', T.minutesBonusTrusted, 4, 'Kept him out of the side'),
        mod('development', T.developmentBonusFocused, 2, 'Training like he has something to lose'),
      ],
    },
  ],
};

const playThroughTournament: Card = {
  id: 'play-through-tournament',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['prime'],
  eligibility: (c) => c.state.national.committed && c.state.national.standing >= 35,
  weight: () => 50,
  title: (c) => `A tournament with ${c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name}, and a groin that is not right`,
  situation: (c) => {
    const nation = c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name;
    return `${nation} have named you and the tournament starts in nine days. Your club's doctor has written to the federation saying you need six weeks. The federation's doctor has examined you for eleven minutes and disagrees. Your club would like you to come home.`;
  },
  options: () => [
    {
      id: 'play',
      label: () => 'Play the tournament',
      detail: () => 'You get one or two of these. Your club get you for ten more years.',
      effects: () => [
        now({
          wear: T.wearFromPlayingInjured,
          injuryProneness: T.injuryPronenessFromPlayingInjured,
          nationalStanding: T.nationalStandingGainLarge * 1.4,
          managerRelationship: -T.managerTrustLoss,
        }),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 2, 'A tournament on a bad groin'),
        maybe(T.gambleLandsChance, 'You were the best player in the squad and everybody saw it', [
          now({
            reputation: T.reputationGainShowcase * 1.5,
            marketValue: T.marketValueBumpShopWindow,
            nationalStanding: T.nationalStandingGainLarge,
          }),
        ], [
          now({ attributes: { pace: -T.attributeLossSmall } }),
          mod('minutes', T.minutesPenaltyInjured, 1, 'Broke down at the tournament'),
        ]),
      ],
    },
    {
      id: 'withdraw',
      label: () => 'Withdraw and get it fixed',
      detail: () => 'Six weeks, a summer at home, and a squad that names somebody else.',
      effects: () => [
        now({
          nationalStanding: -T.nationalStandingLossLarge * 1.5,
          managerRelationship: T.managerTrustLarge,
          wear: -T.wearRelievedByRest,
        }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 3, 'Had the summer to get right'),
        mod('minutes', T.minutesBonusTrusted, 2, 'Fit in August for once'),
      ],
    },
  ],
};

const surgeryNowOrLater: Card = {
  id: 'surgery-now-or-later',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  eligibility: (c) => c.state.condition.wear >= 35,
  weight: () => 45,
  title: () => 'It can wait until the summer, or it can be done now',
  situation: (c) =>
    `An ankle that has been getting worse since Christmas. Now means eight weeks and missing the run-in with ${currentClub(c).name} fourth. The summer means playing on painkillers until May and a longer operation when they finally open it up.`,
  options: () => [
    {
      id: 'now',
      label: () => 'Have it done now',
      detail: () => 'Eight weeks out, and back for pre-season properly fit.',
      effects: () => [
        mod('minutes', T.minutesPenaltyInjured, 1, 'Eight weeks after surgery'),
        now({ wear: -T.wearRelievedByRest * 1.5, managerRelationship: -T.managerTrustLoss / 2 }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 4, 'Ankle sorted properly'),
      ],
    },
    {
      id: 'summer',
      label: () => 'Get through to May on injections',
      detail: () => 'The run-in, and whatever is left of the ankle afterwards.',
      effects: () => [
        now({ wear: T.wearFromPlayingInjured, managerRelationship: T.managerTrustLarge, clubStanding: here(T.clubStandingLoyaltyBonus) }),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 1, 'Playing on an ankle that needs surgery'),
        later(T.delayShort, 'They opened the ankle up in June and it was worse than anyone thought', [
          now({ attributes: { pace: -T.attributeLossSmall, physical: -T.attributeLossSmall } }),
        ]),
      ],
    },
  ],
};

const tournamentSquad: Card = {
  id: 'tournament-squad',
  category: 'international',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  eligibility: (c) => c.state.national.committed && c.state.national.caps >= 5,
  weight: () => 45,
  title: (c) => `${c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name} want you as a squad player`,
  situation: () =>
    `The manager has been honest, which is rare: you are going as cover and you will not start. Five weeks in a hotel, a medal if it goes well, and a pre-season you will not have. The alternative is telling your country you would rather rest.`,
  options: () => [
    {
      id: 'go',
      label: () => 'Go, and carry the bags',
      detail: () => 'A tournament is a tournament, even from the bench.',
      effects: () => [
        now({ nationalStanding: T.nationalStandingGainLarge, wear: T.wearFromHardPreSeason * 1.5, reputation: T.reputationGainCaptain }),
        mod('minutes', T.minutesPenaltySlight, 1, 'No pre-season'),
      ],
    },
    {
      id: 'withdraw',
      label: () => 'Tell them you need the summer',
      detail: () => 'A proper rest, and a manager who will remember you asked.',
      effects: () => [
        now({ nationalStanding: -T.nationalStandingLossLarge, wear: -T.wearRelievedByRest }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Had a summer off'),
        mod('injuryRisk', T.injuryRiskManagedLoad, 2, 'Properly rested'),
      ],
    },
  ],
};

const captainCountry: Card = {
  id: 'captain-country',
  category: 'international',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  oncePerCareer: true,
  eligibility: (c) => c.state.national.committed && c.state.national.caps >= 20 && c.state.national.standing >= 55,
  weight: () => 55,
  title: (c) => `They want you to captain ${c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name}`,
  situation: (c) => {
    const nation = c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name;
    return `${nation} have had three captains in two years. Taking it means the press conferences, the federation politics and being the face of it when it goes wrong, which for ${nation} it usually does. It also means the armband, which is not nothing.`;
  },
  options: () => [
    {
      id: 'take',
      label: () => 'Take it',
      detail: () => 'Your name on the team sheet first, for as long as it lasts.',
      effects: () => [
        now({ nationalStanding: T.nationalStandingGainLarge * 1.3, reputation: T.reputationGainShowcase }),
        mod('standing', T.standingCaptain, 6, 'Captains his country'),
        later(T.delayShort, 'A bad qualifying campaign, and it is your face on the back pages', [
          maybe(0.5, 'The criticism sticks to the captain', [now({ form: -T.moraleHitLarge, reputation: -T.reputationGainCaptain })]),
        ]),
      ],
    },
    {
      id: 'decline',
      label: () => 'Suggest someone else',
      detail: () => 'Keep playing, keep your head down, keep out of the politics.',
      effects: () => [
        now({ nationalStanding: -T.nationalStandingLossLarge }),
        mod('development', T.developmentBonusFocused, 2, 'Nothing to think about but football'),
      ],
    },
  ],
};

const businessOutsideFootball: Card = {
  id: 'business-outside-football',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  oncePerCareer: true,
  eligibility: (c) => c.state.wage >= 1_000_000,
  weight: () => 35,
  title: () => 'Someone wants you to put money into something',
  situation: (c) =>
    `A property development, a restaurant group and a friend's app, and all three have been described to you as certain. You are earning ${money(c.state.wage)} a year and you have been told, correctly, that this stops one day.`,
  options: () => [
    {
      id: 'invest',
      label: () => 'Put real money in',
      detail: () => 'Something for afterwards, and phone calls during the season.',
      effects: () => [
        now({ wage: 0.82, form: -T.moraleHitSmall }),
        mod('development', T.developmentPenaltyMild, 2, 'Distracted'),
        later(T.delayLong, 'The thing you put your money into', [
          maybe(T.likelyChance, 'It came good, and it pays better than football did', [
            now({ form: T.moraleBoostLarge, wage: T.wageUpliftLarge }),
          ], [now({ form: -T.moraleHitLarge, wage: T.wageCutLoyalty })]),
        ]),
      ],
    },
    {
      id: 'safe',
      label: () => 'Put it somewhere boring',
      detail: () => 'No story, no phone calls, no disaster.',
      effects: () => [now({ form: T.moraleBoostSmall / 2 })],
    },
    {
      id: 'ignore',
      label: () => 'Think about it when you retire',
      detail: () => 'Football now. Everything else later.',
      effects: () => [mod('development', T.developmentBonusFocused, 2, 'Nothing outside football')],
    },
  ],
};

const sportsScience: Card = {
  id: 'sports-science',
  category: 'training',
  kind: 'opportunistic',
  stages: ['prime', 'decline'],
  eligibility: (c) => c.state.player.age >= 28,
  weight: () => 50,
  title: () => 'The sports scientists want to change how you train',
  situation: (c) =>
    `Load monitoring, a sleep protocol, and no more double sessions. The head of performance at ${currentClub(c).name} says it will add three years to the end of your career. The manager, who played four hundred games without any of it, has been rolling his eyes about it in front of the squad.`,
  options: () => [
    {
      id: 'adopt',
      label: () => 'Do everything they ask',
      detail: () => 'Fewer hard sessions, and a manager who thinks you are soft.',
      effects: () => [
        now({
          wear: -T.wearRelievedByRest,
          injuryProneness: -T.pronenessRelief,
          managerRelationship: -T.managerTrustLoss / 2,
        }),
        mod('injuryRisk', T.injuryRiskRoundedAthlete, 6, 'Load managed'),
        mod('development', T.developmentPenaltyMild, 2, 'Lighter training'),
      ],
    },
    {
      id: 'old-school',
      label: () => 'Train the way you always have',
      detail: () => 'The manager will like it. Your body has an opinion too.',
      effects: () => [
        now({
          wear: T.wearFromHardPreSeason,
          injuryProneness: T.pronenessLasting / 2,
          managerRelationship: T.managerTrustLarge,
        }),
        mod('development', T.developmentBonusFocused, 3, 'Hard training'),
        mod('injuryRisk', 1.2, 4, 'Nothing managed'),
      ],
    },
  ],
};

export const primeCards = [
  peakNegotiation,
  championsLeagueMove,
  rivalClubOffer,
  signForLife,
  seniorRevolt,
  mentorYoungster,
  playThroughTournament,
  surgeryNowOrLater,
  tournamentSquad,
  captainCountry,
  businessOutsideFootball,
  sportsScience,
];

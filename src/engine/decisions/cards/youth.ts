import { TUNABLES as T } from '../tunables';
import type { Card } from '../types';
import { currentClub, focus, here, later, maybe, mod, money, now } from './helpers';

/**
 * Youth, sixteen to nineteen.
 *
 * Nothing here is about trophies. It is about whether anyone at the club knows
 * your name, whether you are still in the building at nineteen, and what you
 * give up to find out.
 */

const scholarshipTerms: Card = {
  id: 'youth-scholarship',
  category: 'contract',
  kind: 'opportunistic',
  stages: ['youth'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 17,
  weight: () => 70,
  title: (c) => `${currentClub(c).name} want you full time`,
  situation: (c) =>
    `${currentClub(c).name} are offering a two-year scholarship, which means training every morning and finishing school by correspondence. Your mother has read the whole thing twice and asked what happens if it does not work out. The academy director did not have a good answer.`,
  options: () => [
    {
      id: 'all-in',
      label: () => 'Leave school, take the scholarship',
      detail: () => 'Football, all day, every day. Nothing to fall back on.',
      effects: () => [
        now({ managerRelationship: T.managerTrustGain, clubStanding: here(T.clubStandingLoyaltyBonus) }),
        mod('development', T.developmentBonusFocused, 3, 'Training full time'),
      ],
    },
    {
      id: 'both',
      label: () => 'Keep the schooling going alongside it',
      detail: () => 'Evenings and weekends on the books. Less sleep, and a way out if this fails.',
      effects: () => [
        now({ wear: T.wearFromHardPreSeason }),
        mod('development', T.developmentPenaltyMild, 2, 'Split between two things'),
        later(T.delayLong, 'The qualifications turn out to be worth something', [
          now({ reputation: T.reputationGainCaptain }),
        ]),
      ],
    },
  ],
};

const leaveHomeClub: Card = {
  id: 'leave-home-club',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['youth'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 16 && c.state.player.age <= 18,
  weight: () => 55,
  title: () => 'A bigger academy has been watching',
  situation: (c) =>
    `Their chief scout has been at four of your games and finally introduced himself in the car park. Better facilities, better coaching, better players, and a ninety-minute drive each way from the house you grew up in. ${currentClub(c).name} would be paid a compensation fee and would not fight it.`,
  options: () => [
    {
      id: 'go',
      label: () => 'Take the bigger academy',
      detail: () => 'Better coaching, and you are one of forty rather than one of eleven.',
      effects: () => [
        now({ ceiling: { pace: 1, passing: 1, dribbling: 1 }, clubStanding: here(-T.clubStandingSnub) }),
        mod('development', T.developmentBonusEliteCoaching, 3, 'Elite academy coaching'),
        mod('minutes', T.minutesPenaltySlight, 2, 'Queue at a big academy'),
      ],
    },
    {
      id: 'stay',
      label: (c) => `Stay at ${currentClub(c).name}`,
      detail: () => 'They have known you since you were eleven, and they play the kids.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyLarge), managerRelationship: T.managerTrustGain }),
        mod('minutes', T.minutesBonusTrusted, 3, 'They play their own'),
      ],
    },
  ],
};

const seniorProMentor: Card = {
  id: 'senior-pro-mentor',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 20,
  weight: () => 60,
  title: () => 'The old pro has taken an interest',
  situation: () =>
    `He is thirty-four, he has played six hundred games, and for some reason he has decided you are worth his time. He wants you in early on Tuesdays and Thursdays. He is also, everyone agrees, finished, and the manager has stopped picking him.`,
  options: () => [
    {
      id: 'learn',
      label: () => 'Be there at half seven every Tuesday',
      detail: () => 'Thirty years of knowing where to stand, handed over for nothing.',
      effects: () => [
        now({ attributes: { passing: T.attributeGainSmall, defending: T.attributeGainSmall } }),
        now({ ceiling: { passing: T.ceilingGainCoaching, flair: 1 } }),
        mod('development', T.developmentBonusEliteCoaching, 2, 'Learning from someone who knows'),
      ],
    },
    {
      id: 'polite',
      label: () => 'Be polite about it and train with the others',
      detail: () => 'The manager watches the main session. He does not watch the extra one.',
      effects: () => [
        now({ managerRelationship: T.managerTrustGain }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Seen at the right sessions'),
      ],
    },
  ],
};

const reserveManagerDislikes: Card = {
  id: 'reserve-manager-dislikes',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['youth'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 19,
  weight: () => 50,
  title: () => 'The under-21 manager has it in for you',
  situation: () =>
    `He substituted you at half time on Monday and said something about your attitude loud enough for the bench to hear. Two of the lads think he is doing it on purpose because you are the one everyone talks about. Your dad wants to ring the academy director.`,
  options: () => [
    {
      id: 'take-it',
      label: () => 'Say nothing and train harder',
      detail: () => 'He is the one who writes the reports that go upstairs.',
      effects: () => [
        now({ form: -T.moraleHitSmall, wear: T.wearFromHardPreSeason }),
        maybe(T.likelyChance, 'He comes round, and his report is the one that gets you a debut', [
          now({ managerRelationship: T.managerTrustLarge }),
          mod('minutes', T.minutesBonusTrusted, 2, 'Well thought of upstairs'),
        ], [now({ managerRelationship: -T.managerTrustLoss })]),
      ],
    },
    {
      id: 'escalate',
      label: () => 'Let your father make the phone call',
      detail: () => 'It will be dealt with. It will also be remembered.',
      effects: () => [
        now({ clubStanding: here(-T.clubStandingSnub), managerRelationship: -T.managerTrustLoss }),
        mod('minutes', T.minutesBonusTrusted, 1, 'The complaint worked'),
        later(T.delayMedium, 'Nobody at the club has forgotten who your father rang', [
          now({ clubStanding: here(-T.clubStandingSnub) }),
        ]),
      ],
    },
    {
      id: 'ask-to-move',
      label: () => 'Ask to train with a different group',
      detail: () => 'Away from him, and away from the games that get watched.',
      effects: () => [
        mod('minutes', T.minutesPenaltyReserves, 2, 'Out of the under-21 side'),
        mod('development', T.developmentBonusFocused, 2, 'Training with the first team'),
      ],
    },
  ],
};

const positionSwitch: Card = {
  id: 'position-switch',
  category: 'training',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 21,
  weight: () => 45,
  title: () => 'They want to move you back a line',
  situation: () =>
    `The academy's head of coaching thinks you read the game better than you move, and that there is a career for you deeper than where you play now. He has been playing you there on Tuesdays. You have played in your position since you were nine.`,
  options: () => [
    {
      id: 'switch',
      label: () => 'Learn the new role',
      detail: () => 'A year of feeling lost, and possibly a longer career at the end of it.',
      effects: () => [
        now({ ceiling: { passing: T.ceilingGainCoaching, defending: T.ceilingGainCoaching } }),
        mod('minutes', T.minutesPenaltySlight, 2, 'Learning a new position'),
        focus(['passing', 'defending'], 3, 'Retraining'),
        later(T.delayLong, 'The extra role is why you are still being picked', [
          mod('standing', T.standingRoundedGame, 6, 'Can play anywhere'),
        ]),
      ],
    },
    {
      id: 'refuse',
      label: () => 'Tell him you play where you play',
      detail: () => 'You are good at it. You have always been good at it.',
      effects: () => [
        now({ managerRelationship: -T.managerTrustLoss / 2 }),
        focus(['shooting', 'pace'], 3, 'Doubling down on what you do'),
        mod('development', T.developmentBonusFocused, 2, 'Doing one thing properly'),
      ],
    },
  ],
};

const growthSpurt: Card = {
  id: 'growth-spurt',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['youth'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 18,
  weight: () => 55,
  title: () => 'Your knees have stopped forgiving you',
  situation: () =>
    `Four inches in fourteen months and the tendons have not caught up. The club doctor calls it Osgood-Schlatter and says it settles down on its own, usually. He also says that running on it is how boys end up with knees that never come right.`,
  options: () => [
    {
      id: 'rest',
      label: () => 'Sit out the back half of the season',
      detail: () => 'Nobody is scouted from the treatment room.',
      effects: () => [
        mod('minutes', T.minutesPenaltyInjured, 1, 'Resting the knees'),
        now({ wear: -T.wearRelievedByRest }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 4, 'Grew into it properly'),
      ],
    },
    {
      id: 'manage',
      label: () => 'Play the big games only',
      detail: () => 'Miss the Tuesdays, play when the first-team staff are watching.',
      effects: () => [
        now({ wear: T.wearFromPlayingInjured / 2 }),
        mod('minutes', T.minutesPenaltySlight, 1, 'Managed through a growth spurt'),
        maybe(T.gambleLandsChance, 'You are fit for the one game that mattered', [
          now({ managerRelationship: T.managerTrustGain, reputation: T.reputationGainCaptain }),
        ]),
      ],
    },
    {
      id: 'play',
      label: () => 'Play through all of it',
      detail: () => 'You are seventeen. The window is now and everybody says so.',
      effects: () => [
        now({ wear: T.wearFromPlayingInjured, injuryProneness: T.injuryPronenessFromPlayingInjured }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Never out of the side'),
        later(T.delayLong, 'The knee you ran on at seventeen is the knee you have now', [
          now({ attributes: { pace: -T.attributeGainSmall }, injuryProneness: 8 }),
        ]),
      ],
    },
  ],
};

const agentSignsYou: Card = {
  id: 'agent-signs-you',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['youth'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 19,
  weight: () => 55,
  title: () => 'Three agents want to represent you',
  situation: (c) =>
    `One has two internationals on his books and does not return calls. One is your cousin's friend, who is enthusiastic and has never done a deal. One has been sending your family hampers since you were fifteen, which your mother thinks is lovely and your father thinks is a warning. You are earning ${money(c.state.wage)} a year.`,
  options: () => [
    {
      id: 'big-agency',
      label: () => 'Sign with the big agency',
      detail: () => 'They will get you moves. You will be one of ninety names on a list.',
      effects: () => [
        now({ reputation: T.reputationGainShowcase }),
        later(T.delayMedium, 'Your agency put your name in front of people who matter', [
          now({ marketValue: T.marketValueBumpShopWindow }),
        ]),
      ],
    },
    {
      id: 'small-agent',
      label: () => 'Go with the one who knows your family',
      detail: () => 'He answers the phone. He also does not know anyone.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyBonus), form: T.moraleBoostSmall }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Head down, no distractions'),
      ],
    },
    {
      id: 'none',
      label: () => 'Do not sign with anyone yet',
      detail: () => 'Your father reads contracts slowly and asks awkward questions.',
      effects: () => [
        now({ wage: T.wageCutLoyalty, clubStanding: here(T.clubStandingLoyaltyBonus) }),
        later(T.delayMedium, 'With nobody working the phones, the offers went elsewhere', [
          now({ marketValue: T.marketValueDropStagnation }),
        ]),
      ],
    },
  ],
};

const youthInternational: Card = {
  id: 'youth-international',
  category: 'international',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 20,
  weight: () => 50,
  title: (c) => `The ${c.world.nation(c.state.player.nationId).name} under-19s have called`,
  situation: (c) =>
    `A tournament in the summer, three weeks, and your club would rather you spent those weeks with the fitness staff. ${currentClub(c).name} cannot legally stop you. The manager has made it clear he would consider it a favour.`,
  options: () => [
    {
      id: 'go',
      label: () => 'Go to the tournament',
      detail: () => 'Scouts from everywhere watch these. Your manager will notice you went.',
      effects: () => [
        now({ reputation: T.reputationGainShowcase, nationalStanding: T.nationalStandingGain, wear: T.wearFromHardPreSeason, managerRelationship: -T.managerTrustLoss / 2 }),
        later(T.delayShort, 'Somebody who saw you at that tournament has remembered', [
          now({ marketValue: T.marketValueBumpShopWindow }),
        ]),
      ],
    },
    {
      id: 'stay',
      label: () => 'Do the club the favour',
      detail: () => 'A summer of pre-season with the first team, and no shirt with your country on it.',
      effects: () => [
        now({ managerRelationship: T.managerTrustLarge, nationalStanding: -T.nationalStandingLoss / 2 }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Did the manager a favour'),
      ],
    },
  ],
};

const academyLoyalty: Card = {
  id: 'academy-loyalty',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age <= 21,
  weight: () => 45,
  title: (c) => `${currentClub(c).name} want you in the community photos`,
  situation: () =>
    `The club want you fronting the academy's open day, the hospital visit and the schools programme. It is four afternoons over the season and the head of communications has already told the local paper you are doing it. It is also four afternoons you would otherwise spend in the gym.`,
  options: () => [
    {
      id: 'do-it',
      label: () => 'Do the lot',
      detail: (c) => `The supporters at ${currentClub(c).name} remember who turned up.`,
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyLarge), reputation: T.reputationGainCaptain }),
        mod('development', T.developmentPenaltyMild, 1, 'Afternoons away from the gym'),
      ],
    },
    {
      id: 'one',
      label: () => 'Do one and apologise for the rest',
      detail: () => 'Enough to be seen, not enough to cost you the season.',
      effects: () => [now({ clubStanding: here(T.clubStandingLoyaltyBonus / 2) })],
    },
    {
      id: 'none',
      label: () => 'Tell them you are training',
      detail: () => 'Nobody signs a player for his hospital visits.',
      effects: () => [
        now({ clubStanding: here(-T.clubStandingSnub) }),
        mod('development', T.developmentBonusFocused, 2, 'Every afternoon in the gym'),
      ],
    },
  ],
};

const firstDebut: Card = {
  id: 'first-team-debut',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['youth', 'breakthrough'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 17 && c.state.seasons.length >= 1,
  weight: () => 65,
  title: () => 'You are on the bench on Saturday',
  situation: (c) =>
    `Two injuries and a suspension and your name is on the teamsheet at ${currentClub(c).name} for the first time. The manager told you in the corridor, not in a meeting, and then walked off. Nobody has told you whether you are getting on.`,
  options: () => [
    {
      id: 'safe',
      label: () => 'Keep it simple if you get on',
      detail: () => 'Three touches, three passes backwards, no mistakes.',
      effects: () => [
        now({ managerRelationship: T.managerTrustGain, form: T.moraleBoostSmall }),
        mod('minutes', T.minutesBonusTrusted, 2, 'Trusted not to lose it'),
      ],
    },
    {
      id: 'show',
      label: () => 'Try the thing you actually do',
      detail: () => 'If you are only getting twenty minutes, they should be twenty minutes of you.',
      effects: () => [
        maybe(T.gambleLandsChance, 'You do something nobody expected and the ground gets up', [
          now({ clubStanding: here(T.clubStandingDerbyHero / 2), reputation: T.reputationGainShowcase, form: T.moraleBoostLarge }),
          mod('minutes', T.minutesBonusRegularFootball, 3, 'They want to see it again'),
        ], [
          now({ managerRelationship: -T.managerTrustLoss, form: -T.moraleHitLarge }),
          mod('minutes', T.minutesPenaltyReserves, 2, 'Back to the under-21s'),
        ]),
      ],
    },
  ],
};

export const youthCards = [
  scholarshipTerms,
  leaveHomeClub,
  seniorProMentor,
  reserveManagerDislikes,
  positionSwitch,
  growthSpurt,
  agentSignsYou,
  youthInternational,
  academyLoyalty,
  firstDebut,
];

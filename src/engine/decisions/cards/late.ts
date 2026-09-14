import { clubStrength } from '../../league';
import { buildOffer } from '../../transfers';
import { TUNABLES as T } from '../tunables';
import type { Card, Effect } from '../types';
import { currentClub, focus, here, later, lastSeason, maybe, mod, money, moveTo, now, seasonsAt, standingAt, stay, retire } from './helpers';

/**
 * Decline (thirty to thirty-four) and twilight (thirty-four on).
 *
 * Every card here is a version of the same question asked at increasing
 * volume: what are you willing to give up to keep playing, and is there
 * anywhere you would rather stop.
 */

// ---------------------------------------------------------------------------
// Decline
// ---------------------------------------------------------------------------

const wageCutToStay: Card = {
  id: 'wage-cut-to-stay',
  category: 'contract',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  eligibility: (c) => c.state.player.age >= 30 && c.state.contractYearsRemaining <= 1,
  weight: () => 60,
  title: (c) => `${currentClub(c).name} will keep you, at a price`,
  situation: (c) =>
    `The new deal is forty per cent less than the ${money(c.state.wage)} you are on, and the sporting director explained it using the phrase "where you are in your career". He is not wrong. There is nothing else on the table yet, and it is March.`,
  options: () => [
    {
      id: 'accept',
      label: () => 'Take the cut',
      detail: () => 'Less money, same badge, same dressing room.',
      effects: () => [
        now({ contractYears: T.contractYearsShort, wage: 0.6, clubStanding: here(T.clubStandingLoyaltyLarge) }),
        mod('standing', T.standingOneOfTheirOwn, 4, 'Took a cut to stay'),
      ],
    },
    {
      id: 'refuse',
      label: () => 'Refuse and see who else calls',
      detail: () => 'Your price, somewhere else, if anyone is buying at thirty-one.',
      effects: () => [
        now({ contractYears: 0, clubStanding: here(-T.clubStandingAgitationPenalty) }),
        maybe(T.gambleLandsChance, 'Somebody does call, and at your money', [
          now({ marketValue: T.marketValueBumpShopWindow }),
        ], [
          now({ marketValue: T.marketValueDropForgotten, form: -T.moraleHitLarge }),
        ]),
      ],
    },
  ],
};

const dropADivision: Card = {
  id: 'drop-a-division',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  eligibility: (c) => c.state.player.age >= 30 && (lastSeason(c)?.minutes ?? 0) < 1800,
  weight: () => 55,
  prepare: (state, world, rng) => {
    const candidates = world.data.clubs.filter((club) => {
      const strength = clubStrength(state.world, club.id);
      return club.id !== state.clubId && state.player.ovr - strength >= 4 && state.player.ovr - strength <= 16;
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (x) => 1 / (1 + Math.abs(clubStrength(state.world, x.id) - (state.player.ovr - 8))));
    return { offers: [buildOffer(rng, state, world, club.id, { contractYears: 2 })] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} would play you every week` : 'A level down, and a shirt';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    const mins = lastSeason(c)?.minutes ?? 0;
    if (!offer) return 'A smaller club would guarantee you football.';
    return `You played ${mins} minutes last season and watched the rest. ${offer.clubName} are in ${offer.leagueName}, which is a level down, and their manager has said the word "cornerstone" out loud. At ${currentClub(c).name} you are the fourth choice and everybody knows it.`;
  },
  options: (c) => [
    {
      id: 'drop',
      label: () => (c.subject.offers?.[0] ? `Go to ${c.subject.offers[0]!.clubName}` : 'Drop down and play'),
      detail: () => 'Football every week, at a level nobody is watching.',
      effects: (): Effect[] => [
        moveTo(0, 'ambition'),
        mod('minutes', T.minutesBonusRegularFootball, 4, 'Playing every week again'),
        mod('standing', T.standingBigFishSmallPond, 4, 'Best player at the club'),
        now({ reputation: -T.reputationLossInvisibleLeague / 2 }),
      ],
    },
    {
      id: 'stay',
      label: () => `Stay at ${currentClub(c).name} and fight for it`,
      detail: () => 'A bigger badge, a better league, and the bench.',
      effects: (): Effect[] => [
        stay,
        now({ clubStanding: here(T.clubStandingLoyaltyBonus) }),
        maybe(T.longShotChance, 'An injury ahead of you and you are back in the side', [
          mod('minutes', T.minutesBonusRegularFootball, 2, 'Back in the side'),
        ], [
          mod('minutes', T.minutesPenaltyReserves, 2, 'Fourth choice'),
        ]),
      ],
    },
  ],
};

const roleChange: Card = {
  id: 'role-change',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['decline'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 30,
  weight: () => 55,
  title: () => 'He wants you off the teamsheet and in the dressing room',
  situation: (c) =>
    `The manager was decent about it. Twenty minutes a game, the armband on the training pitch, and a job keeping the young ones honest. He used the word "invaluable", which is what managers say when they mean "not starting". ${currentClub(c).name} have three players in your position under twenty-four.`,
  options: () => [
    {
      id: 'accept',
      label: () => 'Take the role',
      detail: () => "Respected, useful, and on the bench at three o'clock.",
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyBonus), managerRelationship: T.managerTrustLarge }),
        mod('standing', T.standingManagersMan, 5, 'Senior professional'),
        mod('minutes', T.minutesPenaltyVeteranRole, 4, 'Twenty minutes a game'),
      ],
    },
    {
      id: 'fight',
      label: () => 'Tell him you are not finished',
      detail: () => 'Make him leave you out rather than agreeing to it.',
      effects: () => [
        now({ managerRelationship: -T.managerTrustLoss, form: T.moraleBoostSmall, wear: T.wearFromHardPreSeason }),
        maybe(T.gambleLandsChance, 'You win the shirt back and hold it', [
          mod('minutes', T.minutesBonusRegularFootball, 5, 'Won it back at thirty-one'),
          now({ clubStanding: here(T.clubStandingLoyaltyBonus) }),
        ], [
          mod('minutes', T.minutesPenaltyReserves, 3, 'Out of the side and out of favour'),
          now({ clubStanding: here(-T.clubStandingSnub) }),
        ]),
      ],
    },
  ],
};

const playerCoach: Card = {
  id: 'player-coach',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 32,
  weight: () => 50,
  title: (c) => `${currentClub(c).name} have offered you a coaching role`,
  situation: () =>
    `Player-coach: two afternoons with the under-21s, a badge course paid for, and a job here when you stop. It also means the manager has started thinking of you as staff, and staff do not get picked.`,
  options: () => [
    {
      id: 'take',
      label: () => 'Take the coaching role',
      detail: () => 'Something afterwards, arranged before you need it.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingTestimonial), managerRelationship: T.managerTrustLarge }),
        mod('minutes', T.minutesPenaltyVeteranRole, 5, 'Half a coach already'),
        mod('standing', T.standingOneOfTheirOwn, 6, 'Part of the furniture'),
      ],
    },
    {
      id: 'later',
      label: () => 'Tell them to ask you again when you stop',
      detail: () => 'You are a player until you are not.',
      effects: () => [
        now({ form: T.moraleBoostSmall, wage: T.wageUpliftModest }),
        mod('minutes', T.minutesBonusTrusted, 4, 'Still a player, and picked like one'),
        mod('development', T.developmentBonusFocused, 2, 'Still a player'),
      ],
    },
  ],
};

const chronicProblem: Card = {
  id: 'chronic-problem',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  eligibility: (c) => c.state.player.age >= 30 && c.state.condition.wear >= 45,
  weight: () => 55,
  title: () => 'It hurts every morning now',
  situation: () =>
    `Not an injury, exactly. A thing that is there when you wake up and goes by eleven, and the doctor has stopped calling it anything. Injections get you through Saturdays. He has told you, plainly, that there is a limit to how many of those a person should have.`,
  options: () => [
    {
      id: 'inject',
      label: () => 'Keep taking the injections',
      detail: () => 'Saturdays, for as long as it lasts.',
      effects: () => [
        mod('minutes', T.minutesBonusTrusted, 3, 'Getting through on injections'),
        now({ wear: T.wearFromPlayingInjured, injuryProneness: T.pronenessLasting }),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 3, 'Masking a chronic problem'),
      ],
    },
    {
      id: 'manage',
      label: () => 'Play two games in three',
      detail: () => 'Fewer games, and more seasons of them.',
      effects: () => [
        mod('minutes', T.minutesPenaltyVeteranRole, 3, 'Managed through the week'),
        mod('injuryRisk', T.injuryRiskManagedLoad, 5, 'Load managed'),
        now({ wear: -T.wearRelievedByRest, injuryProneness: -T.pronenessRelief }),
      ],
    },
    {
      id: 'rest',
      label: () => 'Take three months and fix it properly',
      detail: () => 'Half a season, at an age where half a season is a lot of what is left.',
      effects: () => [
        mod('minutes', T.minutesPenaltyInjured, 1, 'Out for three months'),
        now({ wear: -T.wearRelievedByRest * 2, managerRelationship: -T.managerTrustLoss / 2 }),
        mod('injuryRisk', T.injuryRiskRoundedAthlete, 6, 'Sorted it out'),
      ],
    },
  ],
};

const coachingBadges: Card = {
  id: 'coaching-badges',
  category: 'lifestyle',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 31,
  weight: () => 40,
  title: () => 'The badges take three years and start now',
  situation: () =>
    `Residential weeks, written assessments and a lot of standing in the rain watching under-15s. Everyone who has done it says start before you stop playing, because afterwards nobody returns your calls. It is also every spare week you have for three years.`,
  options: () => [
    {
      id: 'start',
      label: () => 'Start the badges',
      detail: () => 'A life afterwards, paid for with the rest of this one.',
      effects: () => [
        now({ wear: T.wearFromHardPreSeason }),
        mod('development', T.developmentPenaltyMild, 3, 'Weeks away on courses'),
        later(T.delayLong, 'The badges are done, and there is a job waiting', [
          now({ clubStanding: here(T.clubStandingLoyaltyLarge), form: T.moraleBoostLarge }),
        ]),
      ],
    },
    {
      id: 'later',
      label: () => 'Worry about it when you stop',
      detail: () => 'Every spare week goes on being a footballer for longer.',
      effects: () => [
        mod('injuryRisk', T.injuryRiskManagedLoad, 3, 'Resting properly'),
        mod('development', T.developmentBonusFocused, 2, 'Nothing else to think about'),
      ],
    },
  ],
};

const lastTournament: Card = {
  id: 'last-tournament',
  category: 'international',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 31 && c.state.national.committed && c.state.national.caps >= 15,
  weight: () => 55,
  title: (c) => `One more with ${c.world.nation(c.state.national.nationId ?? c.state.player.nationId).name}, or stop now`,
  situation: (c) => {
    const caps = c.state.national.caps;
    return `${caps} caps and a manager who has asked, awkwardly, what your plans are. Staying available means the qualifiers, the long flights and being the oldest man in the squad. Retiring now means a guard of honour in a friendly and your club getting your summers back.`;
  },
  options: () => [
    {
      id: 'stay',
      label: () => 'Stay available',
      detail: () => 'More caps, more miles, and less left for Saturdays.',
      effects: () => [
        now({ nationalStanding: T.nationalStandingGain / 2, wear: T.wearFromHardPreSeason * 1.5 }),
        mod('injuryRisk', 1.25, 3, 'International weeks at thirty-two'),
      ],
    },
    {
      id: 'retire-international',
      label: () => 'Retire from international football',
      detail: () => 'The summers back, and a number of caps that stops moving.',
      effects: () => [
        now({ nationalStanding: -T.nationalStandingLoss, wear: -T.wearRelievedByRest, reputation: T.reputationGainCaptain }),
        mod('minutes', T.minutesBonusTrusted, 3, 'Fresh for his club'),
        mod('injuryRisk', T.injuryRiskManagedLoad, 4, 'Summers off'),
      ],
    },
  ],
};

const returnToFirstClub: Card = {
  id: 'return-to-first-club',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['decline', 'twilight'],
  oncePerCareer: true,
  eligibility: (c) => {
    const first = c.state.seasons[0];
    return (
      c.state.player.age >= 31 &&
      first !== undefined &&
      first.clubId !== c.state.clubId &&
      seasonsAt(c.state, first.clubId) >= 1
    );
  },
  weight: () => 60,
  prepare: (state, world, rng) => {
    const first = state.seasons[0];
    if (!first || first.clubId === state.clubId) return { offers: [] };
    return { offers: [buildOffer(rng, state, world, first.clubId, { contractYears: 2 })], clubId: first.clubId };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName}, where it started` : 'The first club have been in touch';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'The club you started at have been in touch.';
    const years = c.state.player.age - 16;
    return `${years} years since you left and ${offer.clubName} have rung. They are in ${offer.leagueName} now, which may be higher or lower than you remember. The chief executive said the word "fitting" and the supporters' forum has already found out.`;
  },
  options: (c) => [
    {
      id: 'go-home',
      label: () => (c.subject.offers?.[0] ? `Go back to ${c.subject.offers[0]!.clubName}` : 'Go home'),
      detail: () => 'Finish where you started, in front of people who watched you start.',
      effects: (): Effect[] => [
        moveTo(0, 'loyalty'),
        now({ clubStanding: here(T.clubStandingTestimonial * 2.2) }),
        mod('standing', T.standingOneOfTheirOwn, 6, 'Came home'),
        mod('minutes', T.minutesBonusRegularFootball, 3, 'They will play him'),
      ],
    },
    {
      id: 'stay',
      label: () => `Stay at ${currentClub(c).name}`,
      detail: () => 'A better level, and a sentimental story you decline to be in.',
      effects: (): Effect[] => [
        stay,
        now({ clubStanding: here(T.clubStandingLoyaltyBonus) }),
        mod('minutes', T.minutesPenaltyVeteranRole, 3, 'Staying where the football is running out'),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Twilight
// ---------------------------------------------------------------------------

const finalContract: Card = {
  id: 'final-contract',
  category: 'contract',
  kind: 'opportunistic',
  stages: ['twilight'],
  eligibility: (c) => c.state.player.age >= 34,
  weight: () => 60,
  title: () => 'One year, and everyone knows it is the last one',
  situation: (c) =>
    `${currentClub(c).name} will do twelve months. Appearance-based, so you are paid for what you play, and the club can walk away in January. Your agent says it is the only offer he expects to get and that you should take the security of the base wage instead.`,
  options: () => [
    {
      id: 'appearances',
      label: () => 'Take the appearance deal',
      detail: () => 'Paid to play. Nothing if you do not.',
      effects: () => [
        now({ contractYears: T.contractYearsFinal, wage: T.wageAppearanceDeal }),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 2, 'Playing for the appearance money'),
        mod('minutes', T.minutesBonusTrusted, 2, 'Every incentive to be fit'),
        now({ wear: T.wearFromHardPreSeason }),
      ],
    },
    {
      id: 'base',
      label: () => 'Take the flat wage',
      detail: () => 'Less on a good year, something on a bad one.',
      effects: () => [
        now({ contractYears: T.contractYearsFinal * 2, wage: T.wageSecurityDeal }),
        mod('injuryRisk', T.injuryRiskManagedLoad, 2, 'Nothing to prove week to week'),
      ],
    },
  ],
};

const exoticLastMove: Card = {
  id: 'exotic-last-move',
  category: 'transfer',
  kind: 'opportunistic',
  stages: ['twilight'],
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 34 && (c.subject.offers?.length ?? 0) > 0,
  weight: () => 45,
  prepare: (state, world, rng) => {
    const home = world.club(state.clubId).country;
    const candidates = world.data.clubs.filter((club) => {
      const league = world.league(state.world.clubs[club.id]?.leagueId ?? club.leagueId);
      return club.country !== home && league.prestige <= 62 && club.wageBudget >= 45;
    });
    if (candidates.length === 0) return { offers: [] };
    const club = rng.weighted(candidates, (x) => x.wageBudget / 40);
    return { offers: [buildOffer(rng, state, world, club.id, { contractYears: 2 })] };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `Two years in ${offer.leagueName}` : 'One last move';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A club a long way away have been in touch.';
    return `${offer.clubName} want a senior player to put on the poster. It is ${money(offer.wage)}, a city you have never been to, and a league nobody you know will see. Your family have opinions. So does everyone who will tell you it is a retirement home.`;
  },
  options: (c) => [
    {
      id: 'go',
      label: () => (c.subject.offers?.[0] ? `Sign for ${c.subject.offers[0]!.clubName}` : 'Take the move'),
      detail: () => 'Money, sunshine, and an adventure at the end of it.',
      effects: (): Effect[] => [
        moveTo(0, 'money'),
        now({ wage: T.wageUpliftLarge, reputation: -T.reputationLossInvisibleLeague, clubStanding: here(-T.clubStandingSnub) }),
        mod('minutes', T.minutesBonusRegularFootball, 3, 'The marquee man'),
      ],
    },
    {
      id: 'stay',
      label: () => `See it out at ${currentClub(c).name}`,
      detail: () => 'Less money, and finishing somewhere that means something.',
      effects: (): Effect[] => [stay, now({ clubStanding: here(T.clubStandingLoyaltyLarge) })],
    },
  ],
};

const seniorStatesman: Card = {
  id: 'senior-statesman',
  category: 'dressing-room',
  kind: 'opportunistic',
  stages: ['twilight'],
  eligibility: (c) => c.state.player.age >= 34,
  weight: () => 50,
  title: () => 'You are the oldest person in the building',
  situation: (c) =>
    `Including two of the coaches. The young ones call you by your surname and ask you things they will not ask the manager, and ${currentClub(c).name} have started using you in every piece of media they make. None of it is football.`,
  options: () => [
    {
      id: 'embrace',
      label: () => 'Be what they need you to be',
      detail: () => 'The voice in the dressing room, whether or not you are in the side.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingTestimonial), managerRelationship: T.managerTrustLarge }),
        mod('standing', T.standingOneOfTheirOwn, 4, 'The dressing room listens to him'),
        mod('development', T.developmentPenaltyMild, 2, 'Not much time left for his own game'),
      ],
    },
    {
      id: 'player',
      label: () => 'Make it clear you are still a footballer',
      detail: () => 'No media, no mentoring, just the shirt.',
      effects: () => [
        now({ managerRelationship: -T.managerTrustLoss / 2, clubStanding: here(-T.clubStandingSnub / 2) }),
        mod('development', T.developmentBonusFocused, 2, 'Still training like a player'),
        mod('minutes', T.minutesBonusTrusted, 2, 'Fit enough to argue about it'),
      ],
    },
  ],
};

const bodySaysNo: Card = {
  id: 'body-says-no',
  category: 'injury',
  kind: 'opportunistic',
  stages: ['twilight'],
  beat: 'retirement',
  eligibility: (c) => c.state.player.age >= 34 && c.state.condition.wear >= 55,
  weight: () => 55,
  title: () => 'The specialist has asked what you want from the next ten years',
  situation: () =>
    `Not the next season. The next ten years, and whether you would like to be able to walk down stairs normally in them. He was not being dramatic and he was not telling you to stop. He was asking, and waiting for an answer.`,
  options: () => [
    {
      id: 'keep-going',
      label: () => 'Keep going while you still can',
      detail: () => 'There is time to be forty. There is no more time to be this.',
      effects: () => [
        now({ wear: T.wearFromPlayingInjured, injuryProneness: T.pronenessLasting, wage: T.wageUpliftModest }),
        mod('minutes', T.minutesBonusRegularFootball, 4, 'Playing on while he still can'),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 3, 'Nothing left in the tank'),
      ],
    },
    {
      id: 'wind-down',
      label: () => 'Play only when it does not hurt',
      detail: () => 'Fewer games, and knees at fifty.',
      effects: () => [
        mod('minutes', T.minutesPenaltyVeteranRole, 4, 'Picking his games'),
        now({ wear: -T.wearRelievedByRest }),
        mod('injuryRisk', T.injuryRiskRoundedAthlete, 4, 'Careful with what is left'),
      ],
    },
    {
      id: 'stop',
      label: () => 'Stop at the end of the season',
      detail: () => 'On your own terms, with the body more or less intact.',
      effects: () => [
        now({ clubStanding: here(T.clubStandingLoyaltyBonus) }),
        retire,
      ],
    },
  ],
};

const comeHomeToStop: Card = {
  id: 'come-home-to-stop',
  category: 'loyalty',
  kind: 'opportunistic',
  stages: ['twilight'],
  oncePerCareer: true,
  eligibility: (c) => {
    const best = [...c.state.clubStandings].sort((a, b) => b.standing - a.standing)[0];
    return c.state.player.age >= 34 && best !== undefined && best.clubId !== c.state.clubId && best.standing >= 55;
  },
  weight: () => 55,
  prepare: (state, world, rng) => {
    const best = [...state.clubStandings].sort((a, b) => b.standing - a.standing)[0];
    if (!best || best.clubId === state.clubId) return { offers: [] };
    return { offers: [buildOffer(rng, state, world, best.clubId, { contractYears: 1 })], clubId: best.clubId };
  },
  title: (c) => {
    const offer = c.subject.offers?.[0];
    return offer ? `${offer.clubName} would take you back for a year` : 'A place to finish';
  },
  situation: (c) => {
    const offer = c.subject.offers?.[0];
    if (!offer) return 'A club you used to play for would take you back.';
    const years = seasonsAt(c.state, offer.clubId);
    const standing = Math.round(standingAt(c.state, offer.clubId));
    const warmth = standing >= 80 ? 'They have never stopped singing about you' : 'They remember you well';
    return `${years} seasons there, a long time ago. ${warmth}. It is one year, probably from the bench, and it would mean finishing in front of the people who watched you become whatever you became.`;
  },
  options: (c) => [
    {
      id: 'go',
      label: () => (c.subject.offers?.[0] ? `Finish at ${c.subject.offers[0]!.clubName}` : 'Go back to finish'),
      detail: () => 'A year of not much football, in the right shirt.',
      effects: (): Effect[] => [
        moveTo(0, 'loyalty'),
        now({ clubStanding: here(T.clubStandingTestimonial), wage: 0.6 }),
        mod('standing', T.standingOneOfTheirOwn, 4, 'Came back to finish'),
      ],
    },
    {
      id: 'stay',
      label: () => `Finish at ${currentClub(c).name}`,
      detail: () => 'Where you actually are, rather than where the story would prefer.',
      effects: (): Effect[] => [
        stay,
        now({ clubStanding: here(T.clubStandingLoyaltyLarge * 1.5) }),
        mod('standing', T.standingOneOfTheirOwn, 5, 'Saw it out where he belonged'),
      ],
    },
  ],
};

export const declineCards: Card[] = [
  wageCutToStay,
  dropADivision,
  roleChange,
  playerCoach,
  chronicProblem,
  coachingBadges,
  lastTournament,
  returnToFirstClub,
];

export const twilightCards: Card[] = [finalContract, exoticLastMove, seniorStatesman, bodySaysNo, comeHomeToStop];

// ---------------------------------------------------------------------------
// Stopping
// ---------------------------------------------------------------------------

/**
 * The early one. Not the scheduled retirement beat — this is the conversation a
 * bad injury starts at thirty-one, years before anyone expected it.
 */
const earlyRetirement: Card = {
  id: 'early-retirement',
  category: 'retirement',
  kind: 'opportunistic',
  stages: ['decline'],
  oncePerCareer: true,
  eligibility: (c) =>
    c.state.player.age >= 30 &&
    c.state.player.age < 34 &&
    (c.state.condition.wear >= 60 || (c.state.seasons.at(-1)?.matchesMissed ?? 0) >= 20),
  weight: () => 45,
  title: () => 'The surgeon used the word "quality of life"',
  situation: (c) =>
    `Third operation in four years. He was careful about it, but what he said was that the joint is the joint, there is no more cartilage coming, and that players who stop at your age tend to be glad they did. You are ${c.state.player.age}. Nobody stops at ${c.state.player.age}.`,
  options: () => [
    {
      id: 'stop',
      label: () => 'Stop now',
      detail: () => 'Years you did not plan for, and a body you can still use.',
      effects: (): Effect[] => [now({ clubStanding: here(T.clubStandingLoyaltyBonus) }), retire],
    },
    {
      id: 'one-more',
      label: () => 'Give it one more season',
      detail: () => 'See whether there is anything left. Find out either way.',
      effects: (): Effect[] => [
        now({ wear: T.wearFromPlayingInjured, injuryProneness: T.injuryPronenessFromPlayingInjured }),
        mod('injuryRisk', T.injuryRiskPlayingHurt, 2, 'Playing on a joint that is finished'),
        maybe(T.longShotChance, 'It settles down, and you get two more years out of it', [
          mod('minutes', T.minutesBonusTrusted, 3, 'Found something left'),
          now({ wear: -T.wearRelievedByRest }),
        ], [
          mod('minutes', T.minutesPenaltyInjured, 2, 'It never came right'),
        ]),
      ],
    },
    {
      id: 'manage',
      label: () => 'Play on, but properly managed',
      detail: () => 'Half the games, all of the seasons you have left.',
      effects: (): Effect[] => [
        mod('minutes', T.minutesPenaltyInjured, 5, 'Half a season a season'),
        mod('injuryRisk', T.injuryRiskRoundedAthlete, 6, 'Managed carefully'),
        now({ wear: -T.wearRelievedByRest }),
      ],
    },
  ],
};

/** The last one. Where it ends, and in front of whom. */
const hangUpBoots: Card = {
  id: 'hang-up-boots',
  category: 'retirement',
  kind: 'opportunistic',
  stages: ['twilight'],
  beat: 'retirement',
  oncePerCareer: true,
  eligibility: (c) => c.state.player.age >= 34,
  weight: () => 70,
  title: () => 'Somebody is going to ask you at the next press conference',
  situation: (c) => {
    const club = currentClub(c).name;
    const standing = Math.round(standingAt(c.state, c.state.clubId));
    const home = standing >= 70 ? `They would fill ${club} for it` : `${club} would put on something modest`;
    return `You are ${c.state.player.age} and it has become the only question anyone asks. ${home}. There is also the option of saying nothing, playing on, and letting it end when a club stops ringing rather than when you decide.`;
  },
  options: () => [
    {
      id: 'announce',
      label: () => 'Announce it and finish the season',
      detail: () => 'A last game everyone knows is the last game.',
      effects: (): Effect[] => [
        now({ clubStanding: here(T.clubStandingTestimonial), reputation: T.reputationGainShowcase / 2 }),
        retire,
      ],
    },
    {
      id: 'say-nothing',
      label: () => 'Say nothing and keep playing',
      detail: () => 'No goodbye, and no idea which Saturday was the last one.',
      effects: (): Effect[] => [
        mod('minutes', T.minutesPenaltyVeteranRole, 3, 'Playing on quietly'),
        now({ wear: T.wearFromHardPreSeason }),
      ],
    },
  ],
};

const manageTheBody: Card = {
  id: 'manage-the-body',
  category: 'training',
  kind: 'opportunistic',
  stages: ['decline'],
  eligibility: (c) => c.state.player.age >= 30,
  weight: () => 50,
  title: () => 'You cannot train the way you did at twenty-five',
  situation: () =>
    `Two days to recover from a game, not one. The gym work that used to build you now just tires you. The fitness coach has drawn up two plans: one that keeps you sharp for Saturdays and one that tries to hold back what is happening to your legs.`,
  options: () => [
    {
      id: 'sharp',
      label: () => 'Stay sharp for Saturdays',
      detail: () => 'Ready every week, and nothing held back for later.',
      effects: (): Effect[] => [
        mod('minutes', T.minutesBonusTrusted, 3, 'Always available'),
        now({ wear: T.wearFromHardPreSeason }),
      ],
    },
    {
      id: 'preserve',
      label: () => 'Try to hold back the legs',
      detail: () => 'Miss some Saturdays. Keep some pace into your thirties.',
      effects: (): Effect[] => [
        focus(['pace', 'physical'], 4, 'Working on what is going'),
        mod('minutes', T.minutesPenaltyVeteranRole, 2, 'Training around the games'),
        mod('injuryRisk', T.injuryRiskRoundedAthlete, 5, 'Looking after himself'),
      ],
    },
    {
      id: 'technical',
      label: () => 'Stop fighting it and get cleverer',
      detail: () => 'Let the legs go. Work on everything that does not need them.',
      effects: (): Effect[] => [
        focus(['passing', 'flair'], 4, 'Playing with his head instead'),
        mod('standing', T.standingRoundedGame, 5, 'Knows where to stand'),
        now({ attributes: { pace: -T.attributeLossSmall } }),
      ],
    },
  ],
};

declineCards.push(earlyRetirement, manageTheBody);
twilightCards.push(hangUpBoots);

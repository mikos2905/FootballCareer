import { clubStrength } from '../../league';
import { eligibleNations } from '../../international';
import { TUNABLES as T } from '../tunables';
import type { Card, Effect } from '../types';
import { buildOffer } from '../../transfers';
import { currentClub, currentLeague, lastSeason, seasonsAt, standingAt } from './helpers';

/**
 * The derby, half fit. Probabilistic, and the probability is the point: this is
 * the card the permanent-injury tail in phase 2 exists to give weight to.
 */
export const derbyHalfFit: Card = {
  id: 'derby-half-fit',
  category: 'injury',
  kind: 'scheduled',
  beat: 'first-derby',
  cooldownSeasons: 3,
  eligibility: (c) => {
    const club = currentClub(c);
    return club.rivalId !== null && (lastSeason(c)?.minutes ?? 0) > 400;
  },
  weight: () => 90,
  prepare: (state, world) => {
    const club = world.club(state.clubId);
    return { clubId: club.id, rivalClubId: club.rivalId ?? undefined };
  },
  title: (c) => {
    const rival = c.subject.rivalClubId ? c.world.club(c.subject.rivalClubId).name : 'the rivals';
    return `${rival}, Sunday, and your hamstring is not right`;
  },
  situation: (c) => {
    const rival = c.subject.rivalClubId ? c.world.club(c.subject.rivalClubId).name : 'the rivals';
    const club = currentClub(c);
    return `The scan says a grade one and the physio says two weeks. It is ${rival} at home on Sunday and the manager has not asked you directly, which is its own kind of asking. Two of the lads who came through the academy with you have told you what this fixture means to ${club.name} supporters.`;
  },
  options: () => [
    {
      id: 'play',
      label: () => 'Tell him you are fine',
      detail: () => 'You will get through it on adrenaline and whatever the doctor puts in it.',
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: {
            wear: T.wearFromPlayingInjured,
            injuryProneness: T.injuryPronenessFromPlayingInjured,
            managerRelationship: T.managerTrustLarge,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'injuryRisk', value: T.injuryRiskPlayingHurt, seasons: 1, label: 'Playing on a hamstring' },
        },
        {
          kind: 'probabilistic',
          chance: T.derbyHeroChance,
          label: 'You score, and they carry you off on their shoulders',
          then: [
            {
              kind: 'immediate',
              change: {
                clubStanding: { target: { kind: 'current' }, amount: T.clubStandingDerbyHero },
                form: T.moraleBoostLarge,
                reputation: T.reputationGainShowcase,
              },
            },
          ],
          otherwise: [
            {
              kind: 'probabilistic',
              chance: T.derbyInjuryChance,
              label: 'It goes in the second half, and it goes properly',
              then: [
                { kind: 'immediate', change: { wear: T.wearFromPlayingInjured, injuryProneness: T.injuryPronenessFromPlayingInjured } },
                {
                  kind: 'modifier',
                  modifier: { channel: 'minutes', value: T.minutesPenaltyInjured, seasons: 2, label: 'Out with the hamstring' },
                },
                {
                  kind: 'delayed',
                  seasons: T.delayShort,
                  label: 'That hamstring has never been the same since the derby',
                  effects: [{ kind: 'immediate', change: { attributes: { pace: -2 }, injuryProneness: 5 } }],
                },
              ],
              otherwise: [{ kind: 'immediate', change: { form: T.moraleBoostSmall } }],
            },
          ],
        },
      ],
    },
    {
      id: 'sit-it-out',
      label: () => 'Tell him the truth',
      detail: (c) => `Two weeks off, and you watch ${c.subject.rivalClubId ? c.world.club(c.subject.rivalClubId).name : 'them'} from the stand.`,
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: {
            managerRelationship: -T.managerTrustLoss,
            clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub * 1.6 },
            wear: -T.wearRelievedByRest,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'injuryRisk', value: T.injuryRiskManagedLoad, seasons: 2, label: 'Load managed properly' },
        },
      ],
    },
  ],
};

/**
 * The armband. Standing and morale against a pressure modifier — captaincy is
 * a job, and doing it badly in public is worse than not having it.
 */
export const captainsArmband: Card = {
  id: 'captains-armband',
  category: 'dressing-room',
  kind: 'opportunistic',
  oncePerCareer: true,
  eligibility: (c) =>
    c.state.player.age >= 24 &&
    seasonsAt(c.state, c.state.clubId) >= 2 &&
    standingAt(c.state, c.state.clubId) >= 45,
  weight: () => 55,
  title: (c) => `${currentClub(c).name} want you to take the armband`,
  situation: (c) => {
    const club = currentClub(c);
    const years = seasonsAt(c.state, c.state.clubId);
    return `The old captain has gone and the manager wants you to have it. It means the press on Fridays, the players' committee on Mondays, and being the one who stands in front of the cameras after the bad ones. You have been at ${club.name} ${years} ${years === 1 ? 'season' : 'seasons'} and there are two others in that dressing room who think it should be theirs.`;
  },
  options: () => [
    {
      id: 'take-it',
      label: () => 'Take it',
      detail: () => 'The badge on your arm, and everything that comes with wearing it.',
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: {
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingCaptaincy },
            managerRelationship: T.managerTrustGain,
            reputation: T.reputationGainCaptain,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'standing', value: T.standingCaptain, seasons: 4, label: 'Captain' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentPenaltyMild, seasons: 2, label: 'Carrying the dressing room' },
        },
        {
          kind: 'delayed',
          seasons: T.delayShort,
          label: 'A bad run, and it is your face on the back pages',
          effects: [
            {
              kind: 'probabilistic',
              chance: T.captaincyWeighsChance,
              label: 'The captaincy starts to weigh on you',
              then: [{ kind: 'immediate', change: { form: -T.moraleHitLarge } }],
              otherwise: [
                {
                  kind: 'immediate',
                  change: {
                    clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
                    form: T.moraleBoostSmall,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'decline',
      label: () => 'Tell him to give it to someone else',
      detail: () => 'You would rather just play. The manager will take that as an answer about you.',
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: { managerRelationship: -T.managerTrustLoss / 2, form: T.moraleBoostSmall },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentBonusFocused, seasons: 2, label: 'Nothing to think about but playing' },
        },
      ],
    },
    {
      id: 'share-it',
      label: () => 'Suggest the older lad takes it',
      detail: () => 'You back someone else for it, in front of the manager and the group.',
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: {
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyBonus },
            managerRelationship: T.managerTrustGain / 2,
          },
        },
        {
          kind: 'delayed',
          seasons: T.delayMedium,
          label: 'The armband comes back round, and this time nobody argues',
          effects: [
            {
              kind: 'immediate',
              change: {
                clubStanding: { target: { kind: 'current' }, amount: T.clubStandingCaptaincy },
                reputation: T.reputationGainCaptain,
              },
            },
          ],
        },
      ],
    },
  ],
};

/**
 * A new manager who does not fancy you. A minutes modifier that forces a later
 * choice: the card does not resolve the problem, it starts a clock.
 */
export const newManager: Card = {
  id: 'new-manager',
  category: 'dressing-room',
  kind: 'opportunistic',
  cooldownSeasons: 6,
  eligibility: (c) => c.state.condition.managerRelationship < 25 && (lastSeason(c)?.minutes ?? 0) > 300,
  weight: (c) => (c.state.condition.managerRelationship < -20 ? 60 : 26),
  prepare: (state, world, rng) => {
    // Somewhere that would take him in January. The point of this card is that
    // one option actually changes where he plays — modifiers alone wash out
    // over a career, and then the decision is decoration.
    const candidates = world.data.clubs.filter((club) => {
      if (club.id === state.clubId) return false;
      const strength = clubStrength(state.world, club.id);
      return strength <= state.player.ovr + 2 && strength >= state.player.ovr - 12;
    });
    if (candidates.length === 0) return {};
    const club = rng.weighted(candidates, (c) => 1 / (1 + Math.abs(clubStrength(state.world, c.id) - state.player.ovr)));
    return { offers: [buildOffer(rng, state, world, club.id, { contractYears: 3 })] };
  },
  title: () => 'The new manager has a list, and you are not on it',
  situation: (c) => {
    const club = currentClub(c);
    const league = currentLeague(c);
    return `He arrived in October with his own staff and his own ideas about who runs. Three weeks in, you have started once. His assistant told your agent, in a corridor, that you are not what the manager is looking for in ${league.name}. ${club.name} have four months of the window left and you have a contract until the summer.`;
  },
  options: () => [
    {
      id: 'knuckle-down',
      label: () => 'Train like it is a trial',
      detail: () => 'First in, last out, and hope he notices before the window shuts.',
      effects: (): Effect[] => [
        { kind: 'immediate', change: { wear: T.wearFromHardPreSeason } },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesPenaltyFrozenOut, seasons: 1, label: 'Out of the manager’s plans' },
        },
        {
          kind: 'probabilistic',
          chance: T.promiseKeptChance,
          label: 'He comes round, slowly, and you start again in February',
          then: [
            { kind: 'immediate', change: { managerRelationship: T.managerTrustLarge } },
            {
              kind: 'modifier',
              modifier: { channel: 'minutes', value: T.minutesBonusRegularFootball, seasons: 4, label: 'Won him over' },
            },
            {
              kind: 'modifier',
              modifier: { channel: 'standing', value: T.standingCaptain, seasons: 4, label: 'The manager’s man' },
            },
          ],
          otherwise: [
            { kind: 'immediate', change: { managerRelationship: -T.managerTrustCollapse, form: -T.moraleHitLarge } },
            {
              kind: 'modifier',
              modifier: { channel: 'minutes', value: T.minutesPenaltyReserves, seasons: 3, label: 'A year and a half of reserve football' },
            },
            {
              kind: 'modifier',
              modifier: { channel: 'development', value: T.developmentPenaltyBenchSeason, seasons: 3, label: 'Nothing to play for' },
            },
          ],
        },
      ],
    },
    {
      id: 'go-public',
      label: () => 'Say something about it publicly',
      detail: () => 'The supporters will be on your side. The manager reads the papers too.',
      effects: (): Effect[] => [
        {
          kind: 'immediate',
          change: {
            clubStanding: { target: { kind: 'current' }, amount: T.clubStandingLoyaltyLarge },
            managerRelationship: -T.managerTrustCollapse,
            reputation: T.reputationGainShowcase,
          },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesPenaltyFrozenOut, seasons: 2, label: 'Frozen out after going public' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentPenaltyBenchSeason, seasons: 2, label: 'Training with the kids' },
        },
        {
          kind: 'probabilistic',
          chance: T.managerSackedChance,
          label: 'He is gone by March, and the caretaker picks you',
          then: [
            { kind: 'immediate', change: { managerRelationship: T.managerTrustLarge } },
            {
              kind: 'modifier',
              modifier: { channel: 'minutes', value: T.minutesBonusCleanSlate, seasons: 3, label: 'New man, clean slate' },
            },
            {
              kind: 'modifier',
              modifier: { channel: 'standing', value: T.standingSupportersBacking, seasons: 4, label: 'The supporters took your side' },
            },
          ],
          otherwise: [
            { kind: 'immediate', change: { clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingSnub } } },
            {
              kind: 'modifier',
              modifier: { channel: 'minutes', value: T.minutesPenaltyReserves, seasons: 2, label: 'He outlasted you' },
            },
          ],
        },
      ],
    },
    {
      id: 'ask-to-leave',
      label: (c) => {
        const to = c.subject.offers?.[0];
        return to ? `Ask to be sold to ${to.clubName}` : 'Ask the club to let you go';
      },
      detail: () => 'A clean exit in January, at whatever level will take you at short notice.',
      effects: (c): Effect[] => [
        {
          kind: 'immediate',
          change: {
            clubStanding: { target: { kind: 'current' }, amount: -T.clubStandingAgitationPenalty * 1.5 },
            marketValue: T.marketValueDropStagnation,
            // No offer on the table means going out of contract instead.
            ...((c.subject.offers?.length ?? 0) > 0 ? {} : { contractYears: 0 }),
          },
        },
        ...((c.subject.offers?.length ?? 0) > 0
          ? [{ kind: 'transfer' as const, offerIndex: 0, reason: 'forced' as const }]
          : []),
        {
          kind: 'modifier',
          modifier: { channel: 'minutes', value: T.minutesBonusRegularFootball, seasons: 3, label: 'Playing somewhere that wanted you' },
        },
        {
          kind: 'modifier',
          modifier: { channel: 'development', value: T.developmentBonusFocused, seasons: 2, label: 'Wanted again' },
        },
      ],
    },
  ],
};

/** Nationality. Once per career, gated on actually having a choice. */
export const nationalityChoice: Card = {
  id: 'nationality-choice',
  category: 'international',
  kind: 'scheduled',
  beat: 'national-decision',
  oncePerCareer: true,
  eligibility: (c) => !c.state.national.committed && eligibleNations(c.world, c.state.player.nationId).length > 1,
  weight: () => 100,
  prepare: (state, world) => ({
    labels: Object.fromEntries(
      eligibleNations(world, state.player.nationId).map((id) => [id, world.nation(id).name]),
    ),
  }),
  title: (c) => {
    const nations = eligibleNations(c.world, c.state.player.nationId);
    const other = nations[1] ? c.world.nation(nations[1]).name : 'elsewhere';
    return `${other} have been in touch`;
  },
  situation: (c) => {
    const nations = eligibleNations(c.world, c.state.player.nationId);
    const home = c.world.nation(c.state.player.nationId);
    const other = nations[1] ? c.world.nation(nations[1]) : home;
    const gap = home.strength - other.strength;
    const framing =
      gap > 10
        ? `${home.name} have better players than you in your position and have never called. ${other.name} would cap you in March.`
        : `${other.name} want an answer before the qualifiers. ${home.name} have not called, but the squad is announced next month.`;
    return `Your grandmother's passport has turned into a phone call. ${framing} Once you play a competitive match, that is the end of it either way.`;
  },
  options: (c) => {
    const nations = eligibleNations(c.world, c.state.player.nationId);
    const home = c.world.nation(c.state.player.nationId);
    const alternatives = nations.slice(1, 3).map((id) => c.world.nation(id));
    return [
      {
        id: 'home',
        label: () => `Hold out for ${home.name}`,
        detail: () => 'The one you grew up wanting. They may never call.',
        effects: (): Effect[] => [
          { kind: 'declareFor', nationId: home.id },
          { kind: 'immediate', change: { nationalStanding: -T.nationalStandingLoss / 3 } },
        ],
      },
      ...alternatives.map((nation) => ({
        id: `declare-${nation.id}`,
        label: () => `Declare for ${nation.name}`,
        detail: () => `Caps, tournaments, and a shirt that was not the first one you imagined.`,
        effects: (): Effect[] => [
          { kind: 'declareFor', nationId: nation.id },
          { kind: 'immediate', change: { nationalStanding: T.nationalStandingGain, reputation: T.reputationGainCaptain } },
        ],
      })),
    ];
  },
};

export const squadCards = [derbyHalfFit, captainsArmband, newManager, nationalityChoice];
export { clubStrength };

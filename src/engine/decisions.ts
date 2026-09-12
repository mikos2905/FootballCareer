import { wouldRenew as clubWouldRenew } from './transfers';
import type { AttributeKey, CareerState, PendingEffect, StateDelta } from './types';
import type { World } from './world';

/**
 * Decision plumbing.
 *
 * A card is a title, a short situation, and two to four options. Options state
 * their framing honestly and never show a number. Every option must trade off
 * across at least two tracked dimensions — no option may be strictly dominant.
 *
 * NOTE (phase 3): the real card set lands in phase 3. The two cards here exist
 * so the loop, the delayed-consequence machinery and the determinism tests are
 * exercising real code rather than a stub.
 */

export type DecisionCategory =
  | 'transfer'
  | 'loan'
  | 'contract'
  | 'dressing-room'
  | 'training'
  | 'injury'
  | 'lifestyle'
  | 'international'
  | 'loyalty'
  | 'retirement';

export interface MoveIntent {
  clubId: string;
  loan: boolean;
  contractYears: number;
  /** Why the player moved. Leaving for money is what costs you the statue. */
  reason: 'money' | 'ambition' | 'loyalty' | 'loan' | 'free' | 'forced';
}

export interface OptionResolution {
  /** Lands at the start of the coming season. */
  immediate?: StateDelta;
  /** Lands N seasons later. The thing that makes people replay. */
  delayed?: { seasons: number; label: string; effect: StateDelta }[];
  move?: MoveIntent;
  national?: { nationId: string; commit: boolean };
  retire?: boolean;
  /** Attributes a training focus pushes for the coming season. */
  focus?: readonly AttributeKey[];
}

export interface DecisionOption {
  id: string;
  label: string;
  /** Honest framing of the trade-off, in plain language. Never a number. */
  detail: string;
  resolve: (ctx: DecisionContext) => OptionResolution;
}

export interface DecisionCard {
  id: string;
  category: DecisionCategory;
  title: string;
  situation: string;
  options: DecisionOption[];
}

export interface DecisionContext {
  state: CareerState;
  world: World;
}

export interface DecisionDef {
  id: string;
  category: DecisionCategory;
  /** Beats this card can satisfy, if any. */
  beats?: string[];
  available: (ctx: DecisionContext) => boolean;
  build: (ctx: DecisionContext) => DecisionCard;
}

// ---------------------------------------------------------------------------

const TRAINING_FOCUS: DecisionDef = {
  id: 'training-focus',
  category: 'training',
  available: () => true,
  build: ({ state }) => ({
    id: 'training-focus',
    category: 'training',
    title: 'Pre-season',
    situation: `The staff want to know what you are working on this summer. The fitness coach and the technical coach have very different ideas, and you only have so many hours.`,
    options: [
      {
        id: 'physical',
        label: 'Run until you are sick',
        detail: 'The body work. You will be harder to knock off the ball, and harder on yourself.',
        resolve: () => ({
          immediate: { form: 3, wear: 4 },
          focus: ['physical', 'pace'],
        }),
      },
      {
        id: 'technical',
        label: 'Stay behind with the ball',
        detail: 'Hours on the training pitch. The coaches notice; the strength staff do not.',
        resolve: () => ({
          immediate: { wear: 1 },
          focus: ['passing', 'dribbling', 'flair'],
          delayed: [{ seasons: 2, label: 'Technical work pays off', effect: { reputation: 2 } }],
        }),
      },
      {
        id: 'rest',
        label: 'Take the summer off',
        detail: `You are ${state.player.age}. A proper break now might be worth more than another block of work.`,
        resolve: () => ({ immediate: { wear: -6, form: -2, developmentFactor: 0.85 } }),
      },
    ],
  }),
};

const CONTRACT_RENEWAL: DecisionDef = {
  id: 'contract-renewal',
  category: 'contract',
  // Never while on loan — the loan club does not own him, and renewing there
  // silently turns a one-year loan into a four-year stay. And never when the
  // club does not want him: without that check a player who has not kicked a
  // ball in five years renews his own contract indefinitely and no career ever
  // ends by simply not being wanted.
  available: ({ state }) =>
    state.contractYearsRemaining <= 1 && state.parentClubId === null && clubWouldRenew(state),
  build: ({ state, world }) => {
    const club = world.club(state.clubId);
    return {
      id: 'contract-renewal',
      category: 'contract',
      title: 'The offer on the table',
      situation: `${club.name} have put a new deal in front of you. Your agent thinks you could get more by letting it run down. The club would rather you did not.`,
      options: [
        {
          id: 'sign',
          label: 'Sign it now',
          detail: 'Less money than you might get elsewhere. The dressing room and the stands will notice you stayed.',
          resolve: () => ({ immediate: { contractYears: 4, clubStanding: 8, wage: 1.05 } }),
        },
        {
          id: 'hold-out',
          label: 'Let your agent work',
          detail: 'A better deal, eventually. The club will remember you made them wait.',
          resolve: () => ({
            immediate: { contractYears: 3, wage: 1.35, clubStanding: -6 },
            delayed: [{ seasons: 2, label: 'The board did not forget the negotiation', effect: { clubStanding: -5 } }],
          }),
        },
        {
          id: 'run-down',
          label: 'Run the contract down',
          detail: 'Maximum leverage next summer. Maximum damage to how you are seen here.',
          resolve: () => ({ immediate: { contractYears: 1, clubStanding: -14, marketValue: 0.85 } }),
        },
      ],
    };
  },
};

const RETIREMENT_CALL: DecisionDef = {
  id: 'retirement-call',
  category: 'retirement',
  beats: ['retirement'],
  available: ({ state }) => state.player.age >= 33,
  build: ({ state, world }) => {
    const club = world.club(state.clubId);
    return {
      id: 'retirement-call',
      category: 'retirement',
      title: 'One more year?',
      situation: `You are ${state.player.age}. The body takes longer to come round on a Monday, and ${club.name} have not said anything either way. Somebody is going to ask you the question at the next press conference.`,
      options: [
        {
          id: 'continue',
          label: 'One more season',
          detail: 'Another year of football, and another year of mileage on legs that are not getting any younger.',
          resolve: () => ({ immediate: { wear: 4, form: 1 } }),
        },
        {
          id: 'retire',
          label: 'Call it a career',
          detail: 'Go out now, on your own terms, at the club you are at.',
          resolve: () => ({ retire: true }),
        },
      ],
    };
  },
};

export const DECISION_DEFS: readonly DecisionDef[] = [TRAINING_FOCUS, CONTRACT_RENEWAL, RETIREMENT_CALL];

export function decisionDef(id: string): DecisionDef {
  const found = DECISION_DEFS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown decision: ${id}`);
  return found;
}

/** Queues a delayed effect. Consequences that land three seasons later are the point. */
export function queueDelayed(
  state: CareerState,
  resolution: OptionResolution,
  cardId: string,
): PendingEffect[] {
  return (resolution.delayed ?? []).map((d, i) => ({
    id: `${cardId}:${state.season}:${i}`,
    dueSeason: state.season + d.seasons,
    source: cardId,
    label: d.label,
    effect: d.effect,
  }));
}

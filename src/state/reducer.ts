import { draftOrder } from '../engine/creation';
import { hashString, parseSeed } from '../engine/rng';
import { ATTRIBUTE_KEYS, type AttributeKey, type CareerConfig, type DraftPick } from '../engine/types';
import { ARCHETYPE_OPTIONS } from './catalog';

/**
 * The screen state machine, and the answer list a career is replayed from.
 *
 * No game logic lives here either — this records what the player asked for and
 * hands it to the driver. The engine decides everything that follows.
 */
export type Screen = 'creation' | 'draft' | 'season' | 'decision' | 'end';

export interface DraftState {
  /** Archetype ids in the order they are presented. */
  order: string[];
  picks: DraftPick[];
}

export interface GameState {
  config: CareerConfig | null;
  /** Answers to prompts, in the order they were asked. */
  answers: number[];
  /** How many season results the player has looked at. */
  viewedSeasons: number;
  draft: DraftState | null;
  /** Creation form, kept so the draft can be started from it. */
  pending: CareerConfig | null;
}

export const initialState: GameState = {
  config: null,
  answers: [],
  viewedSeasons: 0,
  draft: null,
  pending: null,
};

export type Action =
  | { type: 'start'; config: CareerConfig; mode: 'quick' | 'draft' }
  | { type: 'draftPick'; attribute: AttributeKey }
  | { type: 'decide'; cardId: string; optionId: string; optionIndex: number }
  | { type: 'chooseOffer'; optionIndex: number }
  | { type: 'advanceSeason' }
  | { type: 'restart' };

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'start': {
      if (action.mode === 'quick') {
        return { ...initialState, config: action.config };
      }
      return {
        ...initialState,
        pending: action.config,
        draft: {
          order: draftOrder(action.config.seed, ARCHETYPE_OPTIONS.map((a) => a.id)),
          picks: [],
        },
      };
    }

    case 'draftPick': {
      if (!state.draft || !state.pending) return state;
      const archetypeId = state.draft.order[state.draft.picks.length];
      if (!archetypeId) return state;
      const picks = [...state.draft.picks, { archetypeId, attribute: action.attribute }];
      if (picks.length < ARCHETYPE_OPTIONS.length) {
        return { ...state, draft: { ...state.draft, picks } };
      }
      // Eight picks made: the ceiling is assembled and the career begins.
      return { ...initialState, config: { ...state.pending, draftPicks: picks } };
    }

    case 'decide':
      return { ...state, answers: [...state.answers, action.optionIndex] };

    case 'chooseOffer':
      return { ...state, answers: [...state.answers, action.optionIndex] };

    case 'advanceSeason':
      return { ...state, viewedSeasons: state.viewedSeasons + 1 };

    case 'restart':
      return initialState;

    default:
      return state;
  }
}

/** Attributes still available to take in the draft. */
export function remainingDraftAttributes(draft: DraftState): AttributeKey[] {
  const taken = new Set(draft.picks.map((p) => p.attribute));
  return ATTRIBUTE_KEYS.filter((key) => !taken.has(key));
}

/**
 * Turns whatever was typed in the seed box into a seed, or invents one.
 *
 * Blank means random, and the randomness here is outside the engine's purity
 * contract on purpose: it picks which career you get, and from that point on
 * everything is determined by it.
 */
export function resolveSeed(input: string): { seed: number; label: string } {
  const trimmed = input.trim();
  if (trimmed.length > 0) return { seed: parseSeed(trimmed), label: trimmed };
  const seed = hashString(`${Date.now()}:${Math.random()}`) % 1_000_000;
  return { seed, label: String(seed) };
}

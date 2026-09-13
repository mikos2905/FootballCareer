import { WORLD_DATA } from '../data';
import {
  continueCareer,
  type Career,
  type CareerPolicy,
  type DecisionRequest,
  type TransferRequest,
} from '../engine/career';
import { createCareer } from '../engine/creation';
import { ROLE_LABELS } from '../engine/minutes';
import { substream } from '../engine/rng';
import { buildWorld } from '../engine/world';
import type { CareerConfig, CareerState, SeasonRecord } from '../engine/types';

/**
 * The bridge between the engine's career loop and a UI that has to stop and
 * wait for a person.
 *
 * The loop answers decisions through a synchronous callback, which a UI cannot
 * satisfy — a React app has to return to the event loop and wait for a tap. So
 * a career is replayed from its seed each time an answer is added, with the
 * answers so far supplied from a list and the first unanswered prompt captured
 * and handed to the UI.
 *
 * That sounds wasteful and is not: a full career is about twenty seasons and
 * replays in a couple of milliseconds. It also happens to be exactly the model
 * the share URL needs in phase 6 — a career is a seed plus a list of answers,
 * and nothing else.
 */

export const world = buildWorld(WORLD_DATA);

export interface CardPrompt {
  kind: 'card';
  cardId: string;
  title: string;
  situation: string;
  options: { id: string; label: string; detail: string }[];
  /** What the player needs in order to decide, so nobody has to remember a number. */
  context: PromptContext;
}

export interface TransferPrompt {
  kind: 'transfer';
  title: string;
  situation: string;
  options: { id: string; label: string; detail: string }[];
  /** Index into the engine's offer list, or -1 to stay. Parallel to `options`. */
  choiceValues: number[];
  context: PromptContext;
}

export type Prompt = CardPrompt | TransferPrompt;

/** The state strip shown above every decision. */
export interface PromptContext {
  year: number;
  age: number;
  clubName: string;
  leagueName: string;
  ovr: number;
  /** How the supporters at the current club feel, 1-99. */
  standing: number;
  contractYearsRemaining: number;
  squadRole: string;
  wage: number;
  marketValue: number;
}

export interface Progress {
  /** Seasons played so far, oldest first. */
  seasons: SeasonRecord[];
  /** The decision waiting to be answered, if the career has not finished. */
  prompt: Prompt | null;
  /** Present once the career is over. */
  career: Career | null;
}

function contextFor(state: CareerState): PromptContext {
  const club = world.club(state.clubId);
  const league = world.league(state.world.clubs[state.clubId]?.leagueId ?? club.leagueId);
  const last = state.seasons[state.seasons.length - 1];
  return {
    year: state.year,
    age: state.player.age,
    clubName: club.name,
    leagueName: league.name,
    ovr: state.player.ovr,
    standing: Math.round(state.clubStandings.find((s) => s.clubId === state.clubId)?.standing ?? 20),
    contractYearsRemaining: state.contractYearsRemaining,
    squadRole: last ? ROLE_LABELS[last.squadRole] : 'Academy',
    wage: state.wage,
    marketValue: state.player.marketValue,
  };
}

function cardPrompt(request: DecisionRequest): CardPrompt {
  return {
    kind: 'card',
    cardId: request.card.cardId,
    title: request.card.title,
    situation: request.card.situation,
    options: request.card.options.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
    context: contextFor(request.state),
  };
}

function transferPrompt(request: TransferRequest): TransferPrompt {
  const club = world.club(request.state.clubId);
  const options = request.offers.map((offer) => {
    const confidence =
      offer.projectionConfidence === 'firm'
        ? 'and they mean it'
        : offer.projectionConfidence === 'likely'
          ? 'or so they say'
          : 'though clubs that size change their minds';
    const matches = Math.round(offer.projectedMinutes / 90);
    return {
      id: `${offer.loan ? 'loan' : 'sign'}-${offer.clubId}`,
      label: `${offer.loan ? 'Loan to ' : ''}${offer.clubName}`,
      detail: `${offer.leagueName} · ${ROLE_LABELS[offer.role]} · ${offer.contractYears}-year deal. They say about ${matches} matches' football, ${confidence}.`,
    };
  });
  const choiceValues = request.offers.map((_, i) => i);

  if (!request.mustMove) {
    options.push({
      id: 'stay',
      label: `Stay at ${club.name}`,
      detail: request.renewal
        ? `Sign the new deal and see out another ${request.renewal.contractYears} years here.`
        : 'Nothing changes. You report back for pre-season where you are.',
    });
    choiceValues.push(-1);
  }

  return {
    kind: 'transfer',
    title: 'The summer window',
    situation: request.mustMove
      ? `You are out of contract and ${club.name} have not offered you a new one. You need a club.`
      : request.state.contractYearsRemaining <= 0
        ? `Your contract at ${club.name} is up. They have put a new one in front of you, and your agent has other ideas.`
        : `You are at ${club.name} with ${request.state.contractYearsRemaining} ${request.state.contractYearsRemaining === 1 ? 'year' : 'years'} to run. Your agent has been busy.`,
    options,
    choiceValues,
    context: contextFor(request.state),
  };
}

/**
 * Replays the career with the answers given so far and reports where it got to.
 *
 * An answer is an option index for a card, or an index into `choiceValues` for
 * a transfer window. Both share one list, in the order they were asked.
 */
export function play(config: CareerConfig, answers: readonly number[]): Progress {
  let index = 0;
  let prompt: Prompt | null = null;
  let seasonsAtPrompt = -1;

  const nextAnswer = (): number | null => {
    if (index < answers.length) {
      const answer = answers[index] as number;
      index += 1;
      return answer;
    }
    index += 1;
    return null;
  };

  const policy: CareerPolicy = {
    decide: (request) => {
      const answer = nextAnswer();
      if (answer !== null) return answer;
      if (!prompt) {
        prompt = cardPrompt(request);
        seasonsAtPrompt = request.state.seasons.length;
      }
      return 0;
    },
    transfer: (request) => {
      // Nothing to decide when nobody wants him and he is free to stay.
      if (request.offers.length === 0) return -1;
      const answer = nextAnswer();
      const resolved = transferPrompt(request);
      if (answer !== null) return resolved.choiceValues[answer] ?? -1;
      if (!prompt) {
        prompt = resolved;
        seasonsAtPrompt = request.state.seasons.length;
      }
      return request.mustMove ? 0 : -1;
    },
  };

  const initial = createCareer(substream(config.seed, 'creation', 0), config, world);
  const career = continueCareer(initial, world, policy, config);

  // The replay cannot stop, so it answered the pending prompt with a placeholder
  // and carried on. Only the seasons played before that prompt are real.
  const played = prompt ? seasonsAtPrompt : career.seasons.length;

  return {
    seasons: career.seasons.slice(0, played),
    prompt,
    career: prompt ? null : career,
  };
}

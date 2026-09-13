import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { play, world, type Progress, type Prompt } from './driver';
import { initialState, reducer, type Action, type GameState, type Screen } from './reducer';
import type { SeasonRecord } from '../engine/types';

/**
 * Holds the game and hands the UI what it needs to render.
 *
 * The screen is derived, not stored: there is exactly one screen consistent
 * with a given career state, and storing it separately means it can disagree
 * with the game.
 */
export interface GameView {
  state: GameState;
  screen: Screen;
  progress: Progress;
  /** The season result currently being looked at. */
  currentSeason: SeasonRecord | null;
  /** The season before it, for showing what changed. */
  previousSeason: SeasonRecord | null;
  prompt: Prompt | null;
  dispatch: (action: Action) => void;
  /** Club and league names, so components never touch the world data. */
  nameOfNation: (id: string) => string;
}

const GameContext = createContext<GameView | null>(null);

const EMPTY: Progress = { seasons: [], prompt: null, career: null };

export function GameProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  const progress = useMemo<Progress>(
    () => (state.config ? play(state.config, state.answers) : EMPTY),
    [state.config, state.answers],
  );

  const view = useMemo<GameView>(() => {
    const screen: Screen = !state.config
      ? state.draft
        ? 'draft'
        : 'creation'
      : state.viewedSeasons < progress.seasons.length
        ? 'season'
        : progress.prompt
          ? 'decision'
          : 'end';

    return {
      state,
      screen,
      progress,
      currentSeason: screen === 'season' ? (progress.seasons[state.viewedSeasons] ?? null) : null,
      previousSeason: screen === 'season' ? (progress.seasons[state.viewedSeasons - 1] ?? null) : null,
      prompt: progress.prompt,
      dispatch,
      nameOfNation: (id: string) => world.nation(id).name,
    };
  }, [state, progress]);

  return <GameContext.Provider value={view}>{children}</GameContext.Provider>;
}

export function useGame(): GameView {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside a GameProvider');
  return value;
}

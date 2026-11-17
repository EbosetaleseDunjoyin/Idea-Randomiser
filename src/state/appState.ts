import { pickWinner } from '../engine/random';

export interface Idea {
  id: string;
  text: string;
}

export type Phase = 'entering' | 'selecting' | 'result';

export interface AppState {
  ideas: Idea[];
  phase: Phase;
  /** Decided in START, before any animation runs; animations only play towards it. */
  winnerId: string | null;
  /** Bumped on every START and RESET so late animation callbacks can be ignored. */
  runId: number;
  pickedIds: string[];
  excludeMode: boolean;
  /** Set when START found no eligible idea because of exclusion mode. */
  exhausted: boolean;
}

export type Action =
  | { type: 'ADD'; id: string; text: string }
  | { type: 'EDIT'; id: string; text: string }
  | { type: 'REMOVE'; id: string }
  | { type: 'START' }
  | { type: 'FINISH'; runId: number }
  | { type: 'RESET' }
  | { type: 'TOGGLE_EXCLUDE' };

export const MAX_IDEA_LENGTH = 120;

export const initialState: AppState = {
  ideas: [],
  phase: 'entering',
  winnerId: null,
  runId: 0,
  pickedIds: [],
  excludeMode: false,
  exhausted: false,
};

const clean = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, MAX_IDEA_LENGTH);

/** Any change to the list leaves the result view and returns to entering. */
const edited = (state: AppState, ideas: Idea[], pickedIds = state.pickedIds): AppState => ({
  ...state,
  ideas,
  pickedIds,
  phase: 'entering',
  winnerId: null,
  exhausted: false,
});

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD': {
      const text = clean(action.text);
      if (state.phase === 'selecting' || !text) return state;
      return edited(state, [...state.ideas, { id: action.id, text }]);
    }
    case 'EDIT': {
      const text = clean(action.text);
      if (state.phase === 'selecting' || !text) return state;
      return edited(
        state,
        state.ideas.map((idea) => (idea.id === action.id ? { ...idea, text } : idea)),
        state.pickedIds.filter((id) => id !== action.id),
      );
    }
    case 'REMOVE': {
      if (state.phase === 'selecting') return state;
      return edited(
        state,
        state.ideas.filter((idea) => idea.id !== action.id),
        state.pickedIds.filter((id) => id !== action.id),
      );
    }
    case 'START': {
      if (state.phase === 'selecting' || state.ideas.length < 2) return state;
      const winnerId = pickWinner(state.ideas, state.excludeMode ? state.pickedIds : []);
      if (!winnerId) return { ...state, exhausted: true };
      return { ...state, phase: 'selecting', winnerId, runId: state.runId + 1, exhausted: false };
    }
    case 'FINISH': {
      if (state.phase !== 'selecting' || action.runId !== state.runId || !state.winnerId) return state;
      return { ...state, phase: 'result', pickedIds: [...state.pickedIds, state.winnerId] };
    }
    case 'RESET':
      return { ...initialState, runId: state.runId + 1, excludeMode: state.excludeMode };
    case 'TOGGLE_EXCLUDE':
      if (state.phase === 'selecting') return state;
      return { ...state, excludeMode: !state.excludeMode, exhausted: false };
  }
}

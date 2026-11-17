import { describe, expect, it } from 'vitest';
import { animationFor } from '../engine/random';
import { appReducer, initialState, MAX_IDEA_LENGTH, type Action, type AppState } from './appState';

const run = (actions: Action[], from: AppState = initialState) => actions.reduce(appReducer, from);
const add = (n: number, from: AppState = initialState) =>
  run(Array.from({ length: n }, (_, i): Action => ({ type: 'ADD', id: `i${i}`, text: `Idea ${i}` })), from);

describe('idea management', () => {
  it('trims, collapses whitespace and caps length', () => {
    const s = run([
      { type: 'ADD', id: 'a', text: '  hello   world  ' },
      { type: 'ADD', id: 'b', text: 'x'.repeat(500) },
    ]);
    expect(s.ideas[0].text).toBe('hello world');
    expect(s.ideas[1].text).toHaveLength(MAX_IDEA_LENGTH);
  });

  it('rejects empty ideas and empty edits', () => {
    const s = run([
      { type: 'ADD', id: 'a', text: '   ' },
      { type: 'ADD', id: 'b', text: 'ok' },
      { type: 'EDIT', id: 'b', text: '  ' },
    ]);
    expect(s.ideas).toEqual([{ id: 'b', text: 'ok' }]);
  });

  it('allows the same text twice when intentionally added', () => {
    const s = run([
      { type: 'ADD', id: 'a', text: 'Tacos' },
      { type: 'ADD', id: 'b', text: 'Tacos' },
    ]);
    expect(s.ideas).toHaveLength(2);
  });

  it('updates the animation type as ideas are added and removed', () => {
    let s = add(2);
    expect(animationFor(s.ideas.length)).toBe('coin');
    s = add(7);
    expect(animationFor(s.ideas.length)).toBe('box');
    s = appReducer(s, { type: 'REMOVE', id: 'i0' });
    expect(animationFor(s.ideas.length)).toBe('dice');
    s = run([{ type: 'REMOVE', id: 'i1' }, { type: 'REMOVE', id: 'i2' }], s);
    expect(animationFor(s.ideas.length)).toBe('board');
  });
});

describe('selection', () => {
  it('needs at least two ideas', () => {
    const s = add(1);
    expect(appReducer(s, { type: 'START' })).toBe(s);
  });

  it('picks a winner from the list up front', () => {
    const s = appReducer(add(5), { type: 'START' });
    expect(s.phase).toBe('selecting');
    expect(s.ideas.map((i) => i.id)).toContain(s.winnerId);
  });

  it('ignores overlapping starts and edits while selecting', () => {
    const s = appReducer(add(3), { type: 'START' });
    expect(appReducer(s, { type: 'START' })).toBe(s);
    expect(appReducer(s, { type: 'ADD', id: 'x', text: 'late' })).toBe(s);
    expect(appReducer(s, { type: 'EDIT', id: 'i0', text: 'late' })).toBe(s);
    expect(appReducer(s, { type: 'REMOVE', id: 'i0' })).toBe(s);
    expect(appReducer(s, { type: 'TOGGLE_EXCLUDE' })).toBe(s);
  });

  it('ignores a FINISH from a stale run', () => {
    const s = appReducer(add(3), { type: 'START' });
    expect(appReducer(s, { type: 'FINISH', runId: s.runId - 1 })).toBe(s);
    const done = appReducer(s, { type: 'FINISH', runId: s.runId });
    expect(done.phase).toBe('result');
    expect(done.pickedIds).toEqual([s.winnerId]);
  });

  it('can pick again straight from the result', () => {
    let s = appReducer(add(3), { type: 'START' });
    s = appReducer(s, { type: 'FINISH', runId: s.runId });
    const again = appReducer(s, { type: 'START' });
    expect(again.phase).toBe('selecting');
    expect(again.runId).toBe(s.runId + 1);
  });

  it('never repeats a winner in exclusion mode, then reports exhaustion', () => {
    let s = appReducer(add(4), { type: 'TOGGLE_EXCLUDE' });
    const winners = new Set<string>();
    for (let i = 0; i < 4; i++) {
      s = appReducer(s, { type: 'START' });
      winners.add(s.winnerId!);
      s = appReducer(s, { type: 'FINISH', runId: s.runId });
    }
    expect(winners.size).toBe(4);
    s = appReducer(s, { type: 'START' });
    expect(s.exhausted).toBe(true);
    expect(s.phase).toBe('result');
  });

  it('editing an idea makes it eligible again', () => {
    let s = appReducer(add(2), { type: 'TOGGLE_EXCLUDE' });
    s = appReducer(s, { type: 'START' });
    s = appReducer(s, { type: 'FINISH', runId: s.runId });
    const picked = s.winnerId!;
    s = appReducer(s, { type: 'EDIT', id: picked, text: 'fresh' });
    expect(s.pickedIds).not.toContain(picked);
    expect(s.phase).toBe('entering');
  });

  it('reset clears the session and invalidates in-flight runs', () => {
    const selecting = appReducer(add(3), { type: 'START' });
    const s = appReducer(selecting, { type: 'RESET' });
    expect(s.ideas).toEqual([]);
    expect(s.phase).toBe('entering');
    expect(s.winnerId).toBeNull();
    expect(s.pickedIds).toEqual([]);
    expect(appReducer(s, { type: 'FINISH', runId: selecting.runId })).toBe(s);
  });
});

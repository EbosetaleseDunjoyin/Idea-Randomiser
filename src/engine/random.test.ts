import { describe, expect, it } from 'vitest';
import { animationFor, pickWinner, secureRandomInt } from './random';

const ideas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

describe('animationFor', () => {
  it.each([
    [0, 'none'],
    [1, 'none'],
    [2, 'coin'],
    [3, 'board'],
    [4, 'board'],
    [5, 'board'],
    [6, 'dice'],
    [7, 'box'],
    [40, 'box'],
  ])('%i ideas -> %s', (count, kind) => {
    expect(animationFor(count)).toBe(kind);
  });
});

describe('secureRandomInt', () => {
  it('stays in range', () => {
    for (let i = 0; i < 2000; i++) {
      const v = secureRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('rejects invalid ranges', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError);
    expect(() => secureRandomInt(2.5)).toThrow(RangeError);
  });
});

describe('pickWinner', () => {
  it('always returns an idea from the list', () => {
    const list = ideas(9);
    const ids = new Set(list.map((i) => i.id));
    for (let i = 0; i < 1000; i++) expect(ids.has(pickWinner(list)!)).toBe(true);
  });

  it('is roughly uniform', () => {
    const list = ideas(4);
    const counts: Record<string, number> = {};
    const draws = 20000;
    for (let i = 0; i < draws; i++) {
      const id = pickWinner(list)!;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    // Expected 5000 each, sd ≈ 61; ±400 is > 6 sd, so this won't flake.
    for (const { id } of list) expect(Math.abs(counts[id] - draws / 4)).toBeLessThan(400);
  });

  it('never returns an excluded idea', () => {
    const list = ideas(5);
    for (let i = 0; i < 500; i++) expect(['i3', 'i4']).toContain(pickWinner(list, ['i0', 'i1', 'i2']));
  });

  it('returns null when everything is excluded', () => {
    expect(pickWinner(ideas(2), ['i0', 'i1'])).toBeNull();
  });

  it('refuses fewer than two ideas', () => {
    expect(() => pickWinner(ideas(1))).toThrow();
  });
});

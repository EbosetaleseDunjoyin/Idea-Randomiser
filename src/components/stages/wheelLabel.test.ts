import { describe, expect, it } from 'vitest';
import { LABEL_SPAN, wheelLabel } from './wheelLabel';

const fits = ({ lines, size }: ReturnType<typeof wheelLabel>) => lines.every((l) => l.length * size * 0.62 <= LABEL_SPAN);

describe('wheelLabel', () => {
  it('keeps short labels whole at full size', () => {
    expect(wheelLabel('Hike')).toEqual({ lines: ['Hike'], size: 8.5 });
  });

  it('wraps longer labels onto two balanced lines', () => {
    const label = wheelLabel('Undo global warming forever');
    expect(label.lines).toEqual(['Undo global', 'warming forever']);
    expect(fits(label)).toBe(true);
  });

  it('truncates when even two lines cannot hold it', () => {
    const label = wheelLabel('A very long idea that goes on and on to check that wrapping and clamping hold up');
    expect(label.lines).toHaveLength(2);
    expect(label.lines[1].endsWith('…')).toBe(true);
    expect(fits(label)).toBe(true);
  });

  it('truncates a single unbreakable word', () => {
    const label = wheelLabel('Supercalifragilisticexpialidocious');
    expect(label.lines).toHaveLength(1);
    expect(fits(label)).toBe(true);
  });
});

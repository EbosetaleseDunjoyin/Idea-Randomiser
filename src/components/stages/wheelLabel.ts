/** Radial room for a label between the hub and the pegs on the rim, in wheel viewBox units. */
export const LABEL_SPAN = 68;
const GLYPH = 0.62; // average bold glyph width as a fraction of font size (slightly generous)
const BIG = 8.5;
const SMALL = 7;

const width = (s: string, size: number) => s.length * size * GLYPH;
const clip = (s: string, size: number) => {
  const max = Math.floor(LABEL_SPAN / (size * GLYPH));
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/** Fits a label inside its sector: shrink first, then wrap to two lines, then truncate. */
export function wheelLabel(text: string): { lines: string[]; size: number } {
  if (width(text, BIG) <= LABEL_SPAN) return { lines: [text], size: BIG };
  if (width(text, SMALL) <= LABEL_SPAN) return { lines: [text], size: SMALL };
  const words = text.split(' ');
  if (words.length === 1) return { lines: [clip(text, SMALL)], size: SMALL };
  // Split at the space that best balances the two lines.
  let best = 1;
  let bestLongest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ').length;
    const longest = Math.max(first, text.length - first - 1);
    if (longest < bestLongest) [best, bestLongest] = [i, longest];
  }
  return { lines: [words.slice(0, best).join(' '), words.slice(best).join(' ')].map((l) => clip(l, SMALL)), size: SMALL };
}

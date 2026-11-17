export type AnimationKind = 'none' | 'coin' | 'board' | 'dice' | 'box';

export function animationFor(count: number): AnimationKind {
  if (count < 2) return 'none';
  if (count === 2) return 'coin';
  if (count <= 5) return 'board';
  if (count === 6) return 'dice';
  return 'box';
}

/** Uniform integer in [0, n) from the platform CSPRNG, with rejection sampling to avoid modulo bias. */
export function secureRandomInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError(`Invalid range: ${n}`);
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/**
 * Picks one idea id with equal probability among ideas not in `excludedIds`.
 * Returns null when every idea is excluded.
 */
export function pickWinner(ideas: readonly { id: string }[], excludedIds: readonly string[] = []): string | null {
  if (ideas.length < 2) throw new Error('At least two ideas are needed to randomize');
  const eligible = ideas.filter((idea) => !excludedIds.includes(idea.id));
  if (eligible.length === 0) return null;
  return eligible[secureRandomInt(eligible.length)].id;
}

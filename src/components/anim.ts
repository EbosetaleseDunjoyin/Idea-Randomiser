export const mod = (n: number, m: number) => ((n % m) + m) % m;

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Resolves when every animation finishes; rejects if any is cancelled (callers swallow that). */
export const finished = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished));

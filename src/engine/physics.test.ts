import { describe, expect, it } from 'vitest';
import { agitate, spawnBody, step, type World } from './physics';

describe('physics', () => {
  it('keeps every paper inside the box under violent shaking', () => {
    const world: World = { width: 300, height: 160, ceiling: -60, bodies: [] };
    for (let i = 0; i < 30; i++) world.bodies.push(spawnBody(`p${i}`, world, 14));
    for (let i = 0; i < 1000; i++) {
      const ax = Math.sin(i / 7) * 20000;
      const ay = 2400 + Math.cos(i / 5) * 15000;
      step(world, 1 / 120, ax, ay);
    }
    for (const b of world.bodies) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(b.r - 1e-6);
      expect(b.x).toBeLessThanOrEqual(world.width - b.r + 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(world.ceiling + b.r - 1e-6);
      expect(b.y).toBeLessThanOrEqual(world.height - b.r + 1e-6);
    }
  });

  it('moves every paper when the box is shaken, including ones buried in the pile', () => {
    const world: World = { width: 300, height: 160, ceiling: -70, bodies: [] };
    for (let i = 0; i < 24; i++) world.bodies.push(spawnBody(`p${i}`, world, 14));
    for (let i = 0; i < 600; i++) step(world, 1 / 120, 0, 2400); // let the pile settle
    const start = world.bodies.map((b) => ({ x: b.x, y: b.y }));
    const travel = world.bodies.map(() => 0);
    for (let i = 0; i < 240; i++) {
      const ax = Math.sin(i / 4) * 12000;
      if (i % 2 === 0) agitate(world, 260);
      step(world, 1 / 120, ax, 2400);
      world.bodies.forEach((b, k) => (travel[k] = Math.max(travel[k], Math.hypot(b.x - start[k].x, b.y - start[k].y))));
    }
    for (const t of travel) expect(t).toBeGreaterThan(28); // at least a paper's width
  });

  it('settles papers on the floor under gravity', () => {
    const world: World = { width: 300, height: 160, ceiling: -60, bodies: [] };
    for (let i = 0; i < 5; i++) world.bodies.push(spawnBody(`p${i}`, world, 14));
    for (let i = 0; i < 1200; i++) step(world, 1 / 120, 0, 2400);
    for (const b of world.bodies) expect(Math.hypot(b.vx, b.vy)).toBeLessThan(40);
  });
});

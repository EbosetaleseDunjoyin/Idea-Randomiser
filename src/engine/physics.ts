/**
 * Tiny 2D simulation of folded papers inside a box, in box-local pixels (y points down).
 * Papers are circles: cheap, stable, and visually convincing at this size.
 */
export interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  r: number;
}

export interface World {
  width: number;
  height: number;
  /** Invisible lid above the open rim (negative = above), so tossed papers can fly up but never escape. */
  ceiling: number;
  bodies: Body[];
}

const RESTITUTION = 0.38;
const WALL_FRICTION = 0.9;
const LINEAR_DAMPING = 0.55;
const SPIN_DAMPING = 2.4;
const MAX_SPEED = 2600;

export function spawnBody(id: string, world: World, r: number, rand: () => number = Math.random): Body {
  return {
    id,
    x: world.width / 2 + (rand() - 0.5) * world.width * 0.3,
    y: r,
    vx: (rand() - 0.5) * 160,
    vy: 280,
    angle: rand() * Math.PI * 2,
    spin: (rand() - 0.5) * 12,
    r,
  };
}

/**
 * Random kicks while the box is being shaken. Papers wedged in the pile never feel the walls,
 * so without this some stay put; real paper flutters and catches the air.
 * `strength` is the size of the kick in px/s (scale it with how hard the box moves).
 */
export function agitate(world: World, strength: number, rand: () => number = Math.random): void {
  if (strength <= 0) return;
  for (const b of world.bodies) {
    b.vx += (rand() - 0.5) * 2 * strength;
    b.vy += (rand() - 0.6) * 2 * strength; // slightly upward bias: papers get tossed, gravity brings them back
    b.spin += (rand() - 0.5) * strength * 0.04;
  }
}

/** Advances the world by dt seconds under acceleration (ax, ay), already expressed in box space. */
export function step(world: World, dt: number, ax: number, ay: number): void {
  const lin = Math.exp(-LINEAR_DAMPING * dt);
  const ang = Math.exp(-SPIN_DAMPING * dt);
  const { bodies } = world;

  for (const b of bodies) {
    b.vx = (b.vx + ax * dt) * lin;
    b.vy = (b.vy + ay * dt) * lin;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin *= ang;
    b.angle += b.spin * dt;
  }

  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
    }
    for (const b of bodies) confine(b, world);
  }
}

function collide(a: Body, b: Body) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 1;
  const ny = d > 1e-6 ? dy / d : 0;
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;

  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return;
  const j = (-(1 + RESTITUTION) * rv) / 2;
  a.vx -= j * nx;
  a.vy -= j * ny;
  b.vx += j * nx;
  b.vy += j * ny;
  // Glancing hits set papers spinning.
  const tangential = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
  a.spin -= tangential * 0.012;
  b.spin += tangential * 0.012;
}

function confine(b: Body, { width, height, ceiling }: World) {
  if (b.x < b.r) {
    b.x = b.r;
    if (b.vx < 0) bounce(b, 'x');
  } else if (b.x > width - b.r) {
    b.x = width - b.r;
    if (b.vx > 0) bounce(b, 'x');
  }
  if (b.y < ceiling + b.r) {
    b.y = ceiling + b.r;
    if (b.vy < 0) bounce(b, 'y');
  } else if (b.y > height - b.r) {
    b.y = height - b.r;
    if (b.vy > 0) bounce(b, 'y');
    // Rolling friction on the floor.
    b.spin += (b.vx / b.r - b.spin) * 0.1;
  }
}

function bounce(b: Body, axis: 'x' | 'y') {
  if (axis === 'x') {
    b.vx = -b.vx * RESTITUTION;
    b.vy *= WALL_FRICTION;
  } else {
    b.vy = -b.vy * RESTITUTION;
    b.vx *= WALL_FRICTION;
  }
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { agitate, spawnBody, step, type World } from '../../engine/physics';
import { nextFrame, wait } from '../anim';
import { FoldablePaper, packetCenter } from '../FoldablePaper';
import type { StageProps } from './types';

const GRAVITY = 2400; // px/s²
const SPRING = 230; // how tightly the box follows its target (pointer or shake script)
const DAMPING = 17; // under-damped on purpose: the box overshoots a little, like a real one
const INERTIA = 0.55; // how much of the box's acceleration the papers feel
const AGITATION = 0.02; // random kick (px/s) per px/s² of box acceleration above a calm threshold
const AGITATION_MAX = 240;
const DRAG_THRESHOLD = 36; // px of pointer travel before a drag counts as shaking
const SIM_STEP = 1 / 120;

type Busy = 'idle' | 'shaking' | 'revealing';
interface Reveal {
  id: string;
  text: string;
  run: number;
  /** Packet center and width in stage coordinates, where the paper left the box. */
  from: { x: number; y: number; size: number };
  stage: { w: number; h: number };
}
interface Drag {
  pointerId: number;
  x0: number;
  y0: number;
  boxX: number;
  boxY: number;
  lastX: number;
  lastY: number;
  travel: number;
  maxX: number;
  started: boolean;
}
interface Shake {
  t0: number;
  dur: number;
  amp: number;
  f1: number;
  f2: number;
  p1: number;
  p2: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Papers shrink as the box fills so they always fit with room to tumble. */
const paperRadius = (w: number, h: number, n: number) =>
  clamp(Math.sqrt((0.36 * w * h) / (Math.max(n, 1) * Math.PI)), 8, Math.min(19, w / 4, h / 4));
const paperTransform = (x: number, y: number, rad: number, scale = 1) =>
  `translate3d(${x}px, ${y}px, 0px) translate(-50%, -50%) rotate(${rad}rad) scale(${scale})`;

export function BoxShaker({ ideas, phase, winnerId, runId, reducedMotion, pendingIds, dropRef, onStart, onDone }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const paperEls = useRef(new Map<string, HTMLDivElement>());
  const world = useRef<World>({ width: 300, height: 170, ceiling: -76, bodies: [] });
  const motion = useRef({ x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, tilt: 0, tx: 0, ty: 0 });
  const drag = useRef<Drag | null>(null);
  const shake = useRef<Shake | null>(null);
  const liftAnim = useRef<Animation | null>(null);
  const seq = useRef(0);
  const autoSelect = useRef(false);
  const timers = useRef<number[]>([]);

  const [busy, setBusyState] = useState<Busy>('idle');
  const busyRef = useRef<Busy>('idle');
  const setBusy = (b: Busy) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const [lifting, setLifting] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [size, setSize] = useState({ w: 300, h: 170 });

  // Event handlers and async sequences read the latest props through this ref.
  const latest = useRef({ phase, winnerId, runId, ideas, onStart, onDone });
  latest.current = { phase, winnerId, runId, ideas, onStart, onDone };

  const radius = paperRadius(size.w, size.h, ideas.length);
  const shown = ideas.filter((i) => !pendingIds.has(i.id) && i.id !== reveal?.id);
  const bodyIds = shown.filter((i) => i.id !== lifting).map((i) => i.id);
  const bodyKey = bodyIds.join('|');

  // Keep one physics body per paper in the box; newcomers drop in from the rim.
  useEffect(() => {
    const w = world.current;
    const keep = new Set(bodyIds);
    w.bodies = w.bodies.filter((b) => keep.has(b.id));
    const have = new Set(w.bodies.map((b) => b.id));
    for (const id of bodyIds) if (!have.has(id)) w.bodies.push(spawnBody(id, w, radius));
    for (const b of w.bodies) b.r = radius;
  }, [bodyKey, radius]);

  useEffect(() => {
    const el = innerRef.current!;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      Object.assign(world.current, { width: w, height: h, ceiling: -h * 0.25 });
      setSize({ w, h });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One loop drives the box spring and the papers, writing transforms directly (no React renders per frame).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = motion.current;
      const s = shake.current;
      if (s) {
        const t = (now - s.t0) / s.dur;
        if (t >= 1) {
          shake.current = null;
          m.tx = m.ty = 0;
        } else {
          // Two detuned sine waves under an envelope: irregular, like a hand shaking.
          const env = Math.sin(Math.PI * t);
          const sec = (now - s.t0) / 1000;
          m.tx = env * s.amp * (0.75 * Math.sin(2 * Math.PI * s.f1 * sec + s.p1) + 0.35 * Math.sin(2 * Math.PI * s.f2 * sec + s.p2));
          // Strong up-and-down jolts so papers are thrown up, not just slid sideways.
          m.ty = env * s.amp * 0.5 * Math.sin(2 * Math.PI * s.f2 * 1.3 * sec + s.p1);
        }
      } else if (!drag.current) {
        m.tx = m.ty = 0;
      }

      m.ax = SPRING * (m.tx - m.x) - DAMPING * m.vx;
      m.ay = SPRING * (m.ty - m.y) - DAMPING * m.vy;
      m.vx += m.ax * dt;
      m.vy += m.ay * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.tilt += (clamp(m.vx * 0.022, -16, 16) - m.tilt) * Math.min(1, dt * 10);
      if (boxRef.current) boxRef.current.style.transform = `translate3d(${m.x}px, ${m.y}px, 0px) rotate(${m.tilt}deg)`;

      // Gravity and the box's own acceleration, seen from inside the tilted box.
      const th = (m.tilt * Math.PI) / 180;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const gx = GRAVITY * sn - INERTIA * (m.ax * c + m.ay * sn);
      const gy = GRAVITY * c - INERTIA * (-m.ax * sn + m.ay * c);
      // Kick the papers in proportion to how violently the box is moving; nothing when it's calm.
      agitate(world.current, Math.min(AGITATION_MAX, Math.max(0, Math.hypot(m.ax, m.ay) - 3000) * AGITATION) * dt * 60);
      acc += dt;
      while (acc >= SIM_STEP) {
        step(world.current, SIM_STEP, gx, gy);
        acc -= SIM_STEP;
      }
      for (const b of world.current.bodies) {
        const el = paperEls.current.get(b.id);
        if (!el) continue;
        el.style.transform = paperTransform(b.x, b.y, b.angle);
        el.style.opacity = '1';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      seq.current++;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  /** Abandon any reveal and put its paper back into the box. */
  const abortReveal = () => {
    seq.current++;
    liftAnim.current?.cancel();
    liftAnim.current = null;
    setLifting(null);
    setReveal(null);
    if (busyRef.current === 'revealing') setBusy('idle');
  };
  // A new run, or going back to editing, returns the previous winner to the box.
  useEffect(abortReveal, [runId]);
  useEffect(() => {
    if (phase === 'entering') abortReveal();
  }, [phase]);
  // Reduced motion: "Draw a paper" starts the run, then selects as soon as it exists.
  useEffect(() => {
    if (phase === 'selecting' && autoSelect.current) {
      autoSelect.current = false;
      void select();
    }
  }, [phase, runId]);

  const begin = () => {
    if (latest.current.phase !== 'selecting') latest.current.onStart();
  };

  const shakeBox = () => {
    if (busyRef.current !== 'idle') return;
    begin();
    if (reducedMotion) {
      autoSelect.current = true;
      return;
    }
    const dur = 2200;
    shake.current = {
      t0: performance.now(),
      dur,
      amp: Math.min(130, (stageRef.current?.clientWidth ?? 400) * 0.22),
      f1: 3 + Math.random() * 1.2,
      f2: 5 + Math.random() * 2,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
    };
    setBusy('shaking');
    timers.current.push(window.setTimeout(() => busyRef.current === 'shaking' && setBusy('idle'), dur));
  };

  const select = async () => {
    const { phase: p, winnerId: target, runId: run } = latest.current;
    if (p !== 'selecting' || !target || busyRef.current === 'revealing') return;
    const my = ++seq.current;
    const alive = () => seq.current === my;
    setBusy('revealing');
    shake.current = null;
    drag.current = null;

    // Let the box come to rest and the papers settle before anything comes out.
    await wait(reducedMotion ? 0 : 750);
    if (!alive()) return;
    const stage = stageRef.current;
    const inner = innerRef.current;
    if (!stage || !inner) return;
    const sRect = stage.getBoundingClientRect();
    const el = paperEls.current.get(target);
    const body = world.current.bodies.find((b) => b.id === target);
    let from: Reveal['from'];

    if (el && body && !reducedMotion) {
      // Take the winning paper out of the simulation and lift it up through the open top.
      flushSync(() => setLifting(target));
      await nextFrame();
      if (!alive()) return;
      const w = world.current;
      let a0 = body.angle % (Math.PI * 2);
      if (a0 > Math.PI) a0 -= Math.PI * 2;
      if (a0 < -Math.PI) a0 += Math.PI * 2;
      liftAnim.current = el.animate(
        [
          { transform: paperTransform(body.x, body.y, a0) },
          { offset: 0.4, transform: paperTransform(body.x + (w.width / 2 - body.x) * 0.3, Math.min(body.y, w.height * 0.35), a0 * 0.5, 1.05) },
          { transform: paperTransform(w.width / 2, -radius * 2.4, -0.12, 1.2) },
        ],
        { duration: 700, easing: 'cubic-bezier(.3,.55,.25,1)', fill: 'forwards' },
      );
      try {
        await liftAnim.current.finished;
      } catch {
        return;
      }
      if (!alive()) return;
      const r = el.getBoundingClientRect();
      from = { x: r.left + r.width / 2 - sRect.left, y: r.top + r.height / 2 - sRect.top, size: r.width };
    } else {
      const r = inner.getBoundingClientRect();
      from = { x: r.left + r.width / 2 - sRect.left, y: r.top - sRect.top, size: radius * 2.3 };
    }

    const text = latest.current.ideas.find((i) => i.id === target)?.text ?? '';
    liftAnim.current = null;
    setReveal({ id: target, text, run, from, stage: { w: sRect.width, h: sRect.height } });
    setLifting(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion || busyRef.current === 'revealing' || !stageRef.current || !boxRef.current) return;
    boxRef.current.setPointerCapture(e.pointerId);
    shake.current = null;
    const m = motion.current;
    drag.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      boxX: m.tx,
      boxY: m.ty,
      lastX: e.clientX,
      lastY: e.clientY,
      travel: 0,
      maxX: Math.max(40, (stageRef.current.clientWidth - boxRef.current.offsetWidth) / 2 + 24),
      started: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.travel += Math.hypot(e.clientX - d.lastX, e.clientY - d.lastY);
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    const m = motion.current;
    m.tx = clamp(d.boxX + e.clientX - d.x0, -d.maxX, d.maxX);
    m.ty = clamp(d.boxY + (e.clientY - d.y0) * 0.6, -60, 40);
    if (!d.started && d.travel > DRAG_THRESHOLD) {
      d.started = true;
      begin();
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    // Letting go after a real shake draws a paper.
    if (d.started && e.type === 'pointerup') void select();
  };

  const won = phase === 'result';
  const selecting = phase === 'selecting';
  const paperW = radius * 2.3;
  const paperH = radius * 1.75;

  return (
    <>
      <div className="stage-visual box-stage" ref={stageRef}>
        <div className="box-ground" />
        <div className="box-bounce" ref={dropRef}>
          <div
            className={`box ${busy === 'revealing' ? 'locked' : ''}`}
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={`Box with ${ideas.length} folded ideas. Drag it side to side to shake.`}
            role="img"
          >
            <div className="box-flap back" />
            <div className="box-flap left" />
            <div className="box-flap right" />
            <div className="box-back" />
            <div className="box-inner" ref={innerRef}>
              {shown.map((idea) => (
                <div
                  key={idea.id}
                  className="mini-paper"
                  ref={(el) => {
                    if (el) paperEls.current.set(idea.id, el);
                    else paperEls.current.delete(idea.id);
                  }}
                  style={{ width: paperW, height: paperH, opacity: 0 }}
                />
              ))}
            </div>
            <div className="box-front">
              <span className="box-label">Ideas</span>
              <span className="box-count">{ideas.length} inside</span>
            </div>
          </div>
        </div>
        {reveal && reveal.run === runId && (
          <RevealPaper
            key={reveal.run}
            text={reveal.text}
            from={reveal.from}
            stage={reveal.stage}
            reducedMotion={reducedMotion}
            onDone={() => {
              setBusy('idle');
              latest.current.onDone(reveal.run);
            }}
          />
        )}
      </div>
      <div className="stage-actions">
        <button className="primary" onClick={shakeBox} disabled={busy !== 'idle' || pendingIds.size > 0}>
          {reducedMotion ? 'Draw a paper' : busy === 'shaking' ? 'Shaking…' : won ? 'Shake again' : 'Shake the box'}
        </button>
        {/* Drawing only becomes an option once the box has stopped shaking. */}
        {!reducedMotion && selecting && busy === 'idle' && (
          <button className="secondary" onClick={() => void select()}>
            Select an idea
          </button>
        )}
      </div>
      {!reducedMotion && busy === 'idle' && <p className="hint">Or grab the box and shake it yourself. Let go to draw a paper.</p>}
    </>
  );
}

interface RevealProps {
  text: string;
  from: Reveal['from'];
  stage: Reveal['stage'];
  reducedMotion: boolean;
  onDone: () => void;
}

/** The winning packet rises out of the box, travels to the centre, unfolds, and pops. */
function RevealPaper({ text, from, stage, reducedMotion, onDone }: RevealProps) {
  const W = Math.round(Math.min(250, stage.w * 0.82));
  const H = Math.round(W * 0.62);
  const left = stage.w / 2 - W / 2;
  const top = stage.h * 0.4 - H / 2;
  const pc = packetCenter(W, H);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [stepName, setStepName] = useState<'travel' | 'unfold' | 'done'>(reducedMotion ? 'unfold' : 'travel');

  useEffect(() => {
    if (reducedMotion) return;
    const dx = from.x - (left + pc.x);
    const dy = from.y - (top + pc.y);
    const s = Math.max(0.3, from.size / (W / 4));
    const a = ref.current!.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-7deg) scale(${s})` },
        { offset: 0.45, transform: `translate(${dx * 0.75}px, ${dy - 46}px) rotate(10deg) scale(${s * 1.3})` },
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
      ],
      { duration: 950, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'forwards' },
    );
    a.finished.then(() => setStepName('unfold')).catch(() => {});
    return () => a.cancel();
  }, []);

  const finish = () => {
    setStepName('done');
    const pop = popRef.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: reducedMotion ? 1 : 420, easing: 'ease-out' },
    );
    (pop?.finished ?? Promise.resolve())
      .then(() => doneRef.current())
      .catch(() => {});
  };

  return (
    <div className="reveal" ref={ref} style={{ left, top, width: W, height: H, transformOrigin: `${pc.x}px ${pc.y}px` }}>
      <div className={`reveal-pop ${stepName === 'done' ? 'glow' : ''}`} ref={popRef}>
        <FoldablePaper
          text={text}
          width={W}
          height={H}
          direction="unfold"
          start={stepName !== 'travel'}
          instant={reducedMotion}
          foldMs={300}
          onComplete={finish}
        />
        {stepName === 'done' && !reducedMotion && (
          <div className="burst" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * 36}deg` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

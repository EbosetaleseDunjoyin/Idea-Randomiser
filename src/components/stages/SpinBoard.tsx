import { useEffect, useRef } from 'react';
import { mod } from '../anim';
import type { StageProps } from './types';
import { wheelLabel } from './wheelLabel';

const COLORS = ['#ff7a59', '#ffc145', '#36c2a0', '#4c9dff', '#9c7bff'];
const INK = ['#fff', '#3d2a00', '#06362b', '#fff', '#fff'];
const R = 96;
const DURATION = 5200;

/** Angles are clockwise from 12 o'clock, where the pointer sits. */
const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
};

export function SpinBoard({ ideas, phase, winnerId, runId, reducedMotion, dropRef, onStart, onDone }: StageProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const selecting = phase === 'selecting';
  const seg = 360 / ideas.length;
  const winnerIndex = ideas.findIndex((i) => i.id === winnerId);

  useEffect(() => {
    if (!selecting) return;
    const wheel = wheelRef.current!;
    const pointer = pointerRef.current!;
    const from = angle.current;
    // Land anywhere inside the winner's sector (cosmetic jitter only; the winner is already decided).
    const jitter = (Math.random() - 0.5) * seg * 0.7;
    const rest = mod(-((winnerIndex + 0.5) * seg) + jitter, 360);
    const target = from + 360 * (reducedMotion ? 0 : 6) + mod(rest - from, 360);
    const settle = () => {
      wheel.style.transform = `rotate(${target}deg)`;
      angle.current = target;
    };

    if (reducedMotion) {
      settle();
      const t = setTimeout(() => onDone(runId), 300);
      return () => clearTimeout(t);
    }

    const spin = wheel.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${target}deg)` }], {
      duration: DURATION,
      easing: 'cubic-bezier(.12,.68,.13,1)',
      fill: 'forwards',
    });

    // The pointer flicks each time a sector boundary passes under it.
    const sectorAt = (deg: number) => Math.floor(mod(-deg, 360) / seg);
    let last = sectorAt(from);
    let raf = 0;
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(wheel).transform);
      const s = sectorAt((Math.atan2(m.b, m.a) * 180) / Math.PI);
      if (s !== last) {
        last = s;
        pointer.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-22deg)', offset: 0.3 }, { transform: 'rotate(0deg)' }], {
          duration: 160,
          easing: 'ease-out',
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    let alive = true;
    spin.finished
      .then(() => {
        if (!alive) return;
        cancelAnimationFrame(raf);
        settle();
        spin.cancel();
        onDone(runId);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      spin.cancel();
    };
  }, [selecting, runId]);

  const won = phase === 'result';
  return (
    <>
      <div className="stage-visual board-stage" ref={dropRef}>
        <div className="board">
          <div className="board-pointer" ref={pointerRef} />
          <div className="board-wheel" ref={wheelRef} style={{ transform: `rotate(${angle.current}deg)` }}>
            <svg viewBox="-100 -100 200 200" role="img" aria-label="Spin board">
              {ideas.map((idea, i) => {
                const a0 = i * seg;
                const mid = a0 + seg / 2;
                const cls = won ? (idea.id === winnerId ? 'win' : 'dim') : '';
                const label = wheelLabel(idea.text);
                return (
                  <g key={idea.id} className={`sector ${cls}`}>
                    <path d={`M0 0 L${point(a0, R)} A${R} ${R} 0 0 1 ${point(a0 + seg, R)} Z`} fill={COLORS[i % COLORS.length]} />
                    <text
                      fill={INK[i % INK.length]}
                      fontSize={label.size}
                      transform={`rotate(${mid}) translate(0 ${-R * 0.55}) rotate(${mid > 180 ? 90 : -90})`}
                    >
                      {label.lines.map((line, n) => (
                        <tspan key={n} x="0" dy={n === 0 ? `${-(label.lines.length - 1) * 0.6}em` : '1.2em'}>
                          {line}
                        </tspan>
                      ))}
                      <title>{idea.text}</title>
                    </text>
                  </g>
                );
              })}
              {ideas.map((idea, i) => {
                const [x, y] = point(i * seg, R - 5).split(' ');
                return <circle key={idea.id} className="peg" cx={x} cy={y} r="2.6" />;
              })}
              <circle className="hub" r="13" />
            </svg>
          </div>
        </div>
      </div>
      <div className="stage-actions">
        <button className="primary" onClick={onStart} disabled={selecting}>
          {selecting ? 'Spinning…' : won ? 'Spin again' : 'Spin the board'}
        </button>
      </div>
    </>
  );
}

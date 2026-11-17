import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { nextFrame } from './anim';

type Axis = 'X' | 'Y';
interface Rect {
  l: number;
  t: number;
  w: number;
  h: number;
}
interface Fold {
  base: Rect;
  flap: Rect;
  origin: string;
  axis: Axis;
  angle: number;
}

/**
 * Three real folds, all anchored to the sheet's top-left so nothing jumps between steps:
 * right half over left, bottom half up, right half over left again → a W/4 × H/2 packet.
 */
const foldsFor = (W: number, H: number): Fold[] => [
  { base: { l: 0, t: 0, w: W / 2, h: H }, flap: { l: W / 2, t: 0, w: W / 2, h: H }, origin: '0% 50%', axis: 'Y', angle: -180 },
  { base: { l: 0, t: 0, w: W / 2, h: H / 2 }, flap: { l: 0, t: H / 2, w: W / 2, h: H / 2 }, origin: '50% 0%', axis: 'X', angle: 180 },
  { base: { l: 0, t: 0, w: W / 4, h: H / 2 }, flap: { l: W / 4, t: 0, w: W / 4, h: H / 2 }, origin: '0% 50%', axis: 'Y', angle: -180 },
];

const rot = (axis: Axis, deg: number) => `rotate${axis}(${deg}deg)`;
const place = ({ l, t, w, h }: Rect): CSSProperties => ({ left: l, top: t, width: w, height: h });

/** Packet center relative to the sheet's top-left, for positioning flights. */
export const packetCenter = (W: number, H: number) => ({ x: W / 8, y: H / 4 });

interface Props {
  text: string;
  width: number;
  height: number;
  direction: 'fold' | 'unfold';
  start: boolean;
  /** Skip the fold steps (reduced motion) and jump to the end state. */
  instant?: boolean;
  foldMs?: number;
  onComplete?: () => void;
}

export function FoldablePaper({ text, width: W, height: H, direction, start, instant = false, foldMs = 260, onComplete }: Props) {
  const folds = foldsFor(W, H);
  const [step, setStep] = useState(() => (direction === 'fold' ? (instant ? 3 : 0) : instant ? 0 : 3));
  const flapRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (!start) return;
    let alive = true;
    let current: Animation[] = [];
    (async () => {
      await nextFrame();
      if (!instant) {
        for (const k of direction === 'fold' ? [0, 1, 2] : [2, 1, 0]) {
          if (!alive) return;
          flushSync(() => setStep(k));
          const fold = folds[k];
          const [from, to] = direction === 'fold' ? [0, fold.angle] : [fold.angle, 0];
          current = [
            flapRef.current!.animate([{ transform: rot(fold.axis, from) }, { transform: rot(fold.axis, to) }], {
              duration: foldMs,
              easing: 'cubic-bezier(.5,.05,.3,1)',
              fill: 'forwards',
            }),
            // The flap's shadow sweeps across the half it lands on.
            shadeRef.current!.animate([{ opacity: 0 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0 }], { duration: foldMs }),
          ];
          await Promise.all(current.map((a) => a.finished));
        }
        if (!alive) return;
        if (direction === 'fold') flushSync(() => setStep(3));
      }
      if (alive) completeRef.current?.();
    })().catch(() => {});
    return () => {
      alive = false;
      current.forEach((a) => a.cancel());
    };
    // Runs once per start; the sequence owns its own steps.
  }, [start]);

  const frameStyle = { width: W, height: H, '--pw': `${W}px` } as CSSProperties;

  if (step === 3) {
    return (
      <div className="paper-frame" style={frameStyle}>
        <div className="paper-part packet" style={place({ l: 0, t: 0, w: W / 4, h: H / 2 })} />
      </div>
    );
  }

  const fold = folds[step];
  const withText = step === 0;
  const flapRest = direction === 'unfold' && !instant ? fold.angle : 0;
  const sheetText = (offsetX: number) => (
    <div className="paper-text" style={{ left: -offsetX, width: W, height: H }}>
      <span>{text}</span>
    </div>
  );

  return (
    <div className="paper-frame" style={frameStyle}>
      <div className={`paper-part base ${withText ? '' : 'blank'}`} style={place(fold.base)}>
        {withText && sheetText(0)}
        <div className="paper-shade" ref={shadeRef} />
      </div>
      <div
        key={step}
        ref={flapRef}
        className="paper-part flap"
        style={{ ...place(fold.flap), transformOrigin: fold.origin, transform: rot(fold.axis, flapRest) }}
      >
        <div className={`paper-face ${withText ? '' : 'blank'}`}>{withText && sheetText(fold.flap.l)}</div>
        <div className="paper-face back blank" style={{ transform: rot(fold.axis, 180) }} />
      </div>
    </div>
  );
}

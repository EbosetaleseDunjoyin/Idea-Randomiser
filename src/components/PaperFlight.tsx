import { useEffect, useRef, useState } from 'react';
import { FoldablePaper, packetCenter } from './FoldablePaper';

interface Props {
  text: string;
  /** Where the paper appears (the input field). */
  from: DOMRect;
  /** Read at take-off, so the paper finds the container even if the stage just changed. */
  getTarget: () => { x: number; y: number };
  onLanded: () => void;
}

const W = 190;
const H = 114;
const LIFT = -96;

/** A submitted idea: pops up as a sheet, folds three times, then arcs into the stage. */
export function PaperFlight({ text, from, getTarget, onLanded }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const flight = useRef<Animation | null>(null);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const [folding, setFolding] = useState(false);

  const left = Math.min(Math.max(8, from.left + from.width / 2 - W / 2), window.innerWidth - W - 8);
  const top = from.top + from.height / 2 - H / 2;
  const pc = packetCenter(W, H);

  useEffect(() => {
    const appear = ref.current!.animate(
      [
        { transform: 'translateY(0px) scale(.7) rotateX(55deg)', opacity: 0 },
        { transform: `translateY(${LIFT}px) scale(1) rotateX(0deg)`, opacity: 1 },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.8,.3,1.15)', fill: 'forwards' },
    );
    appear.finished.then(() => setFolding(true)).catch(() => {});
    return () => {
      appear.cancel();
      flight.current?.cancel();
    };
  }, []);

  const fly = () => {
    const el = ref.current;
    if (!el) return;
    const target = getTarget();
    const dx = target.x - (left + pc.x);
    const dy = target.y - (top + LIFT + pc.y);
    const lift = `translateY(${LIFT}px)`;
    flight.current = el.animate(
      [
        { transform: `${lift} translate(0px, 0px) rotate(0deg) scale(1)` },
        { offset: 0.45, transform: `${lift} translate(${dx * 0.45}px, ${Math.min(dy, 0) * 0.45 - 80}px) rotate(170deg) scale(.85)` },
        { transform: `${lift} translate(${dx}px, ${dy}px) rotate(360deg) scale(.55)` },
      ],
      { duration: 720, easing: 'cubic-bezier(.4,.1,.35,1)', fill: 'forwards' },
    );
    flight.current.finished.then(() => landedRef.current()).catch(() => {});
  };

  return (
    <div className="flight" ref={ref} style={{ left, top, width: W, height: H, transformOrigin: `${pc.x}px ${pc.y}px` }}>
      <FoldablePaper text={text} width={W} height={H} direction="fold" start={folding} onComplete={fly} />
    </div>
  );
}

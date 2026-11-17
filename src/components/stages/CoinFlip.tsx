import { useEffect, useRef } from 'react';
import { FLICK_SPEED, useDragRotate } from '../../hooks/useDragRotate';
import { finished, mod } from '../anim';
import type { StageProps } from './types';

const EDGE_LAYERS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const DURATION = 2700;

export function CoinFlip({ ideas, phase, winnerId, runId, reducedMotion, dropRef, onStart, onDone }: StageProps) {
  const tossRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const snap = useRef<Animation | null>(null);
  const angle = useRef(0);
  const selecting = phase === 'selecting';
  const winnerIndex = ideas.findIndex((i) => i.id === winnerId);

  // Drag sideways to turn the coin over; it settles flat on the nearer face. Flick it to toss.
  const dragHandlers = useDragRotate({
    enabled: !selecting,
    onDrag: (dx) => {
      snap.current?.cancel();
      angle.current += dx * 0.8;
      coinRef.current!.style.transform = `rotateY(${angle.current}deg)`;
    },
    onRelease: (vx) => {
      const from = `rotateY(${angle.current}deg)`;
      angle.current = Math.round(angle.current / 180) * 180;
      const to = `rotateY(${angle.current}deg)`;
      coinRef.current!.style.transform = to;
      snap.current = coinRef.current!.animate([{ transform: from }, { transform: to }], {
        duration: 450,
        easing: 'cubic-bezier(.3,1.35,.5,1)',
      });
      if (Math.abs(vx) > FLICK_SPEED) onStart();
    },
  });

  useEffect(() => {
    if (!selecting) return;
    snap.current?.cancel();
    const coin = coinRef.current!;
    const from = angle.current;
    const target = from + 360 * (reducedMotion ? 0 : 7) + mod((winnerIndex === 1 ? 180 : 0) - from, 360);
    const settle = () => {
      coin.style.transform = `rotateY(${target}deg)`;
      angle.current = target;
    };

    if (reducedMotion) {
      settle();
      const t = setTimeout(() => onDone(runId), 300);
      return () => clearTimeout(t);
    }

    const anims = [
      // Spins fast off the thumb, slows in the air, and has stopped turning when it lands.
      coin.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${target}deg)` }], {
        duration: DURATION * 0.84,
        easing: 'cubic-bezier(.25,.15,.25,1)',
        fill: 'forwards',
      }),
      tossRef.current!.animate(
        [
          { offset: 0, transform: 'translateY(0) rotateZ(0deg) scale(1)', easing: 'cubic-bezier(.2,.7,.4,1)' },
          { offset: 0.42, transform: 'translateY(-16vmin) rotateZ(0deg) scale(1.12)', easing: 'cubic-bezier(.6,0,.85,.5)' },
          { offset: 0.84, transform: 'translateY(0) rotateZ(0deg) scale(1)', easing: 'ease-out' },
          { offset: 0.9, transform: 'translateY(-14px) rotateZ(4deg) scale(1.02)', easing: 'ease-in' },
          { offset: 0.95, transform: 'translateY(0) rotateZ(-2deg) scale(1)' },
          { offset: 1, transform: 'translateY(0) rotateZ(0deg) scale(1)' },
        ],
        { duration: DURATION, fill: 'forwards' },
      ),
      shadowRef.current!.animate(
        [
          { offset: 0, transform: 'scale(1)', opacity: 1 },
          { offset: 0.42, transform: 'scale(.45)', opacity: 0.35 },
          { offset: 0.84, transform: 'scale(1)', opacity: 1 },
          { offset: 0.9, transform: 'scale(.85)', opacity: 0.8 },
          { offset: 1, transform: 'scale(1)', opacity: 1 },
        ],
        { duration: DURATION },
      ),
    ];
    let alive = true;
    finished(anims)
      .then(() => {
        if (!alive) return;
        settle();
        anims.forEach((a) => a.cancel());
        onDone(runId);
      })
      .catch(() => {});
    return () => {
      alive = false;
      anims.forEach((a) => a.cancel());
    };
  }, [selecting, runId]);

  const won = phase === 'result';
  return (
    <>
      <div className="stage-visual coin-stage" ref={dropRef}>
        <div className={`coin-scene ${selecting ? '' : 'grabbable'}`} {...dragHandlers}>
          <div className="coin-shadow" ref={shadowRef} />
          <div className="coin-toss" ref={tossRef}>
            <div className="coin-tilt">
              <div className={`coin ${won ? 'won' : ''}`} ref={coinRef} style={{ transform: `rotateY(${angle.current}deg)` }}>
                {EDGE_LAYERS.map((z) => (
                  <div key={z} className="coin-edge" style={{ transform: `translateZ(${z}px)` }} />
                ))}
                <div className="coin-face heads">
                  <small>Heads</small>
                  <span>{ideas[0].text}</span>
                </div>
                <div className="coin-face tails">
                  <small>Tails</small>
                  <span>{ideas[1].text}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="legend coin-legend">
        {ideas.map((idea, i) => (
          <span key={idea.id} className={won && idea.id === winnerId ? 'win' : ''} title={idea.text}>
            <b>{i === 0 ? 'Heads' : 'Tails'}</b> {idea.text}
          </span>
        ))}
      </div>
      <div className="stage-actions">
        <button className="primary" onClick={onStart} disabled={selecting}>
          {selecting ? 'Flipping…' : won ? 'Flip again' : 'Flip the coin'}
        </button>
      </div>
      {!selecting && <p className="hint">Drag the coin to turn it over, or flick it to toss.</p>}
    </>
  );
}

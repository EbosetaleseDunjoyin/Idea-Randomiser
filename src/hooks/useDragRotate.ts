import { useRef, type PointerEvent } from 'react';

interface Options {
  enabled: boolean;
  /** Pointer movement since the last event, in px. */
  onDrag: (dx: number, dy: number) => void;
  /** Release velocity in px/ms (0 if the pointer had stopped before letting go). */
  onRelease: (vx: number, vy: number) => void;
}

/** Pointer handlers for spinning an object by dragging it; spread onto the element. */
export function useDragRotate({ enabled, onDrag, onRelease }: Options) {
  const drag = useRef<{ id: number; x: number; y: number; t: number; vx: number; vy: number } | null>(null);

  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const stalled = e.timeStamp - d.t > 80;
    onRelease(stalled ? 0 : d.vx, stalled ? 0 : d.vy);
  };

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!enabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, vy: 0 };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dt = Math.max(1, e.timeStamp - d.t);
      // Smoothed so one jittery event doesn't decide whether a release counts as a flick.
      d.vx = 0.7 * (dx / dt) + 0.3 * d.vx;
      d.vy = 0.7 * (dy / dt) + 0.3 * d.vy;
      Object.assign(d, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      onDrag(dx, dy);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

/** Release speed (px/ms) above which a drag counts as a throw. */
export const FLICK_SPEED = 1.1;

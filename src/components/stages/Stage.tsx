import { lazy, Suspense } from 'react';
import type { AnimationKind } from '../../engine/random';
import { BoxShaker } from './BoxShaker';
import { CoinFlip } from './CoinFlip';
import { SpinBoard } from './SpinBoard';
import type { StageProps } from './types';

// three.js only loads when someone actually has six ideas.
const DiceRoll = lazy(() => import('./DiceRoll').then((m) => ({ default: m.DiceRoll })));

export function Stage({ kind, ...props }: StageProps & { kind: AnimationKind }) {
  switch (kind) {
    case 'coin':
      return <CoinFlip {...props} />;
    case 'board':
      return <SpinBoard {...props} />;
    case 'dice':
      return (
        <Suspense fallback={<div className="stage-visual" ref={props.dropRef} />}>
          <DiceRoll {...props} />
        </Suspense>
      );
    case 'box':
      return <BoxShaker {...props} />;
    case 'none':
      return (
        <>
          <div className="stage-visual empty-stage" ref={props.dropRef}>
            <div className="tray">
              <p>{props.ideas.length === 0 ? 'Your ideas will land here.' : 'Nice. Add one more idea to start randomizing.'}</p>
            </div>
          </div>
          <div className="stage-actions">
            <button className="primary" disabled>
              {props.ideas.length === 0 ? 'Add a couple of ideas' : 'Add another idea'}
            </button>
          </div>
        </>
      );
  }
}

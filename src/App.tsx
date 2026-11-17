import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { IdeaInput } from './components/IdeaInput';
import { IdeaList } from './components/IdeaList';
import { PaperFlight } from './components/PaperFlight';
import { Stage } from './components/stages/Stage';
import { animationFor, type AnimationKind } from './engine/random';
import { useReducedMotion } from './hooks/useReducedMotion';
import { appReducer, initialState } from './state/appState';

const MODE_LABEL: Record<AnimationKind, string> = {
  none: 'Waiting for ideas',
  coin: 'Coin flip',
  board: 'Spin board',
  dice: 'Dice roll',
  box: 'Box shaker',
};

let idSeq = 0;
const newId = () => `${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

interface Flight {
  id: string;
  text: string;
  from: DOMRect;
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const reducedMotion = useReducedMotion();
  const dropRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const pendingIds = useMemo(() => new Set(flights.map((f) => f.id)), [flights]);

  const kind = animationFor(state.ideas.length);
  const selecting = state.phase === 'selecting';
  const winner = state.phase === 'result' ? state.ideas.find((i) => i.id === state.winnerId) : undefined;

  const addIdea = (text: string, from: DOMRect) => {
    const id = newId();
    dispatch({ type: 'ADD', id, text });
    if (!reducedMotion) setFlights((f) => [...f, { id, text, from }]);
  };

  const dropPoint = useCallback(() => {
    const r = dropRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.28 } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  }, []);

  const landed = useCallback((id: string) => {
    setFlights((f) => f.filter((x) => x.id !== id));
    // The container gives a little as the paper lands.
    dropRef.current?.animate(
      [
        { transform: 'translateY(0px) scale(1, 1)' },
        { transform: 'translateY(6px) scale(1.03, .96)', offset: 0.35 },
        { transform: 'translateY(-2px) scale(.99, 1.01)', offset: 0.7 },
        { transform: 'translateY(0px) scale(1, 1)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
  }, []);

  const reset = () => {
    setFlights([]);
    dispatch({ type: 'RESET' });
  };

  return (
    <div className="app">
      <header className="hero">
        <h1>Idea Randomizer</h1>
        <p>Can’t decide? Drop in your ideas, one at a time, and let chance pick one.</p>
      </header>

      <main className="layout">
        <section className="stage-card" aria-label="Randomizer">
          <div className="stage-meta">
            <span>
              {state.ideas.length} {state.ideas.length === 1 ? 'idea' : 'ideas'}
            </span>
            <span className="mode">{MODE_LABEL[kind]}</span>
          </div>
          <div className="stage" key={kind}>
            <Stage
              kind={kind}
              ideas={state.ideas}
              phase={state.phase}
              winnerId={state.winnerId}
              runId={state.runId}
              reducedMotion={reducedMotion}
              pendingIds={pendingIds}
              dropRef={dropRef}
              onStart={() => dispatch({ type: 'START' })}
              onDone={(runId) => dispatch({ type: 'FINISH', runId })}
            />
          </div>
          {state.exhausted && (
            <p className="note" role="status">
              Every idea has been picked once. Turn off “No repeats” or start over.
            </p>
          )}
          <div className="result-slot" aria-live="polite">
            {winner && (
              <div className="result" key={state.runId}>
                <span className="result-label">The winner is</span>
                <p className="result-text">{winner.text}</p>
              </div>
            )}
          </div>
        </section>

        <section className="entry-card" aria-label="Your ideas">
          <IdeaInput ideas={state.ideas} disabled={selecting} onAdd={addIdea} />
          <IdeaList
            ideas={state.ideas}
            disabled={selecting}
            pickedIds={state.pickedIds}
            excludeMode={state.excludeMode}
            onEdit={(id, text) => dispatch({ type: 'EDIT', id, text })}
            onRemove={(id) => dispatch({ type: 'REMOVE', id })}
          />
          <div className="entry-foot">
            <label className="toggle">
              <input type="checkbox" checked={state.excludeMode} disabled={selecting} onChange={() => dispatch({ type: 'TOGGLE_EXCLUDE' })} />
              No repeats
            </label>
            <button className="ghost" onClick={reset} disabled={state.ideas.length === 0 && flights.length === 0}>
              Start over
            </button>
          </div>
        </section>
      </main>

      <div className="flights" aria-hidden>
        {flights.map((f) => (
          <PaperFlight key={f.id} text={f.text} from={f.from} getTarget={dropPoint} onLanded={() => landed(f.id)} />
        ))}
      </div>
    </div>
  );
}

import type { RefObject } from 'react';
import type { Idea, Phase } from '../../state/appState';

/** Every stage animates *towards* winnerId; it never decides the result. */
export interface StageProps {
  ideas: Idea[];
  phase: Phase;
  winnerId: string | null;
  runId: number;
  reducedMotion: boolean;
  /** Ideas whose paper is still flying in. */
  pendingIds: ReadonlySet<string>;
  /** Where flying papers land. */
  dropRef: RefObject<HTMLDivElement>;
  onStart: () => void;
  onDone: (runId: number) => void;
}

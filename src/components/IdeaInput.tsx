import { useRef, useState, type FormEvent } from 'react';
import { MAX_IDEA_LENGTH, type Idea } from '../state/appState';

interface Props {
  ideas: Idea[];
  disabled: boolean;
  onAdd: (text: string, from: DOMRect) => void;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function IdeaInput({ ideas, disabled, onAdd }: Props) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      setHint('Type an idea first.');
      return;
    }
    // Exact repeats are usually accidental; a second press confirms they're intended.
    if (!confirmDuplicate && ideas.some((i) => normalize(i.text) === normalize(value))) {
      setConfirmDuplicate(true);
      setHint('That one is already in. Press Add again to add it anyway.');
      return;
    }
    onAdd(value, inputRef.current!.getBoundingClientRect());
    setText('');
    setHint(null);
    setConfirmDuplicate(false);
    inputRef.current?.focus();
  };

  return (
    <form className="idea-input" onSubmit={submit}>
      <label htmlFor="idea" className="sr-only">
        New idea
      </label>
      <input
        id="idea"
        ref={inputRef}
        value={text}
        maxLength={MAX_IDEA_LENGTH}
        disabled={disabled}
        placeholder={disabled ? 'Hold on, choosing…' : 'Write an idea…'}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setHint(null);
          setConfirmDuplicate(false);
        }}
      />
      <button className="primary" type="submit" disabled={disabled}>
        Add idea
      </button>
      {hint && (
        <p className="hint" role="status">
          {hint}
        </p>
      )}
    </form>
  );
}

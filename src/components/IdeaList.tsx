import { useState } from 'react';
import { MAX_IDEA_LENGTH, type Idea } from '../state/appState';

interface Props {
  ideas: Idea[];
  disabled: boolean;
  pickedIds: string[];
  excludeMode: boolean;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}

export function IdeaList({ ideas, disabled, pickedIds, excludeMode, onEdit, onRemove }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (ideas.length === 0) return <p className="empty-list">No ideas yet. Add your first one above.</p>;

  const commit = () => {
    if (editing && draft.trim()) onEdit(editing, draft);
    setEditing(null);
  };

  return (
    <ol className="idea-list">
      {ideas.map((idea, i) => (
        <li key={idea.id} className={excludeMode && pickedIds.includes(idea.id) ? 'picked' : ''}>
          <span className="idea-num">{i + 1}</span>
          {editing === idea.id ? (
            <input
              className="idea-edit"
              aria-label={`Edit idea ${i + 1}`}
              autoFocus
              value={draft}
              maxLength={MAX_IDEA_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <button
              className="idea-text"
              disabled={disabled}
              title="Click to edit"
              onClick={() => {
                setEditing(idea.id);
                setDraft(idea.text);
              }}
            >
              {idea.text}
            </button>
          )}
          <button className="idea-remove" disabled={disabled} onClick={() => onRemove(idea.id)} aria-label={`Remove “${idea.text}”`}>
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}

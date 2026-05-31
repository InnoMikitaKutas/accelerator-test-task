import { useId, useState } from 'react';
import { X } from 'lucide-react';
import styles from './TagInput.module.css';

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Wire to a FormField's label (`htmlFor` → this id). */
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  /** Accessible name when there is no associated visible label. */
  ariaLabel?: string;
}

/**
 * Free-text tag editor (credentials / certifications, FR-032). Enter or comma commits
 * the draft; Backspace on an empty field removes the last tag; blur commits a pending
 * draft so typed text is never silently lost. Duplicates are ignored.
 */
export function TagInput({
  value,
  onChange,
  id,
  describedBy,
  invalid,
  placeholder,
  ariaLabel,
}: Readonly<TagInputProps>) {
  const [draft, setDraft] = useState('');
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const commit = (raw: string) => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className={styles.wrap} data-invalid={invalid || undefined}>
      {value.map((tag, i) => (
        <span key={tag} className={styles.tag}>
          {tag}
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove ${tag}`}
            onClick={() => removeAt(i)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        className={styles.input}
        type="text"
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            removeAt(value.length - 1);
          }
        }}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

import type { JSX } from 'react';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  /** Controlled value — owned by `useConversationSearch`, never here. */
  readonly value: string;
  readonly onChange: (nextValue: string) => void;
  /** Empties the term; also wired to Escape (FR7). */
  readonly onClear: () => void;
}

/**
 * The Sidebar's search input (`ui-context.md` §3 → «نوار جستجو در بالا»).
 *
 * Purely controlled: it forwards keystrokes and reports clear requests, owning
 * no state of its own, so clearing from anywhere (a test, a future shortcut)
 * behaves exactly like typing over the term.
 *
 * No visible label by design — the placeholder plus `aria-label` carry the
 * name (`ui-context.md` §6), matching how the import dropzone labels itself.
 */
export function SearchBar({ value, onChange, onClear }: SearchBarProps): JSX.Element {
  return (
    <div className={styles.wrap}>
      <input
        type="search"
        className={styles.input}
        aria-label="جستجو در عنوان و متن گفتگوها"
        placeholder="جستجو…"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          // Escape restores the library view without hunting for the ✕ —
          // standard search-box behaviour, keyboard-first per ui-context §6.
          if (event.key === 'Escape') {
            onClear();
          }
        }}
      />
      {value !== '' && (
        <button
          type="button"
          className={styles.clear}
          aria-label="پاک کردن جستجو"
          onClick={onClear}
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}

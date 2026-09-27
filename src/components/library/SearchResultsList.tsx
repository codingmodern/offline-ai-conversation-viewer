import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryEntry } from '@/types/storage';
import { ConversationListItem } from '@/components/library/ConversationListItem';
import styles from './SearchResultsList.module.css';

interface SearchResultsListProps {
  /** The library's own entries, already intersected with the matched ids. */
  readonly entries: readonly LibraryEntry[];
  readonly activeId: number | undefined;
  readonly query: string;
  readonly onSelect: (id: number) => void;
  readonly onRequestDelete: (id: number) => void;
}

/**
 * The result view that replaces the Sidebar list while a search term is active
 * (Unit 07 UI Behavior).
 *
 * Rows are **the same `ConversationListItem`** the normal list renders — that is
 * the whole FR4 mechanism in one line: clicking a result reports the same
 * `onSelect` the Sidebar row does, so there is exactly one way to open a
 * conversation and no parallel navigation path. Per-conversation rows (not one
 * per message) because this version opens the conversation without scrolling to
 * or highlighting the matching message — explicitly out of scope.
 *
 * Zero results is a state, not an error (FR8): an explanatory `role="status"`
 * note in muted text, never the error banner.
 */
export function SearchResultsList({
  entries,
  activeId,
  query,
  onSelect,
  onRequestDelete,
}: SearchResultsListProps): JSX.Element {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return (
      <div className={styles.noResults} role="status">
        <p className={styles.noResultsTitle}>{t('search.noResultsTitle', { query })}</p>
        <p className={styles.noResultsHint}>{t('search.noResultsHint')}</p>
      </div>
    );
  }

  return (
    <section className={styles.results} aria-label={t('search.resultsLabel')}>
      {/* Confirmation that the term applied — NFR1-visible feedback without a spinner. */}
      <p className={styles.meta}>{t('search.resultsMeta', { count: entries.length, query })}</p>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <ConversationListItem
            key={entry.id}
            entry={entry}
            isActive={entry.id === activeId}
            onSelect={onSelect}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </ul>
    </section>
  );
}

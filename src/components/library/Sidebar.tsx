import { useMemo } from 'react';
import type { JSX } from 'react';
import type { LibraryEntry } from '@/types/storage';
import { ConversationListItem } from '@/components/library/ConversationListItem';
import { SearchBar } from '@/components/library/SearchBar';
import { SearchResultsList } from '@/components/library/SearchResultsList';
import type { UseConversationSearchResult } from '@/features/search/useConversationSearch';
import styles from './Sidebar.module.css';

interface SidebarProps {
  readonly entries: readonly LibraryEntry[];
  readonly activeId: number | undefined;
  readonly isLoading: boolean;
  /** Unit 07's search slice — injected by `AppShell` like every other shell state. */
  readonly search: UseConversationSearchResult;
  readonly onSelect: (id: number) => void;
  readonly onRequestDelete: (id: number) => void;
  /** Asks the shell to show the one bulk-clear confirmation (ADR #14). */
  readonly onRequestClearAll: () => void;
  /** Reveals the import screen (`ui-context.md` §3 → Import entry at sidebar bottom). */
  readonly onImportClick: () => void;
}

/**
 * The conversation library list (FR4/FR5).
 *
 * Purely presentational: it receives entries and reports clicks. It never queries
 * storage (FR3) and never renders conversation content (FR10) — the active id is
 * simply reported upward, and the shell decides what fills the main region.
 *
 * **No list virtualization.** NFR2 forbids adding it preemptively, so rows are
 * rendered plainly until real measurements justify otherwise (ADR: deferred in
 * `architecture.md` §5).
 *
 * Unit 07: while a non-empty search term is active, the list is replaced by
 * `SearchResultsList`; clearing the term (or Escape) brings this view straight
 * back — one boolean branch, no reload (FR6/FR7).
 */
export function Sidebar({
  entries,
  activeId,
  isLoading,
  search,
  onSelect,
  onRequestDelete,
  onRequestClearAll,
  onImportClick,
}: SidebarProps): JSX.Element {
  const { query, isSearching, matchedIds, setQuery, clearQuery } = search;

  // Intersection keeps ordering/display data owned by the library emission:
  // ids that left the DB between emissions can never render a stale row.
  const matchedIdSet = useMemo(() => new Set(matchedIds), [matchedIds]);
  const matchedEntries =
    isSearching ? entries.filter((entry) => matchedIdSet.has(entry.id)) : [];

  return (
    <nav className={styles.sidebar} aria-label="کتابخانه‌ی گفتگوها">
      <h2 className={styles.heading}>گفتگوهای ذخیره‌شده</h2>

      {/*
        Three distinct states, never conflated: loading is not emptiness, and
        emptiness inside the sidebar is a short hint (the full Empty State with its
        call to action belongs to the main region).
      */}
      {isLoading ? (
        <p className={styles.status}>در حال بارگذاری…</p>
      ) : entries.length === 0 ? (
        <p className={styles.status}>هنوز گفتگویی ذخیره نشده است.</p>
      ) : (
        <>
          {/* Hidden on an empty/loading library: searching has nothing to answer,
              so it defers to Unit 04's Empty State rather than inventing a second one. */}
          <SearchBar value={query} onChange={setQuery} onClear={clearQuery} />

          {isSearching ? (
            <SearchResultsList
              entries={matchedEntries}
              activeId={activeId}
              query={query}
              onSelect={onSelect}
              onRequestDelete={onRequestDelete}
            />
          ) : (
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
          )}
        </>
      )}

      {/* The bulk action sits beside the import action at the sidebar's foot —
          the one place that is reachable no matter how long the list gets. It is
          offered only when there is something to clear, and it merely *requests*:
          the shell-level dialog decides (FR6/FR7 pattern, ADR #14). */}
      {entries.length > 0 && (
        <button type="button" className={styles.clearAll} onClick={onRequestClearAll}>
          حذف همه‌ی گفتگوها
        </button>
      )}

      <button type="button" className={styles.import} onClick={onImportClick}>
        + افزودن گفتگو
      </button>
    </nav>
  );
}


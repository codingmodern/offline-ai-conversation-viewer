import { useMemo } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryEntry } from '@/types/storage';
import type { ProviderId } from '@/types/providers';
import { SearchBar } from '@/components/library/SearchBar';
import { SearchResultsList } from '@/components/library/SearchResultsList';
import { SidebarGroup } from '@/components/library/SidebarGroup';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import type { UseConversationSearchResult } from '@/features/search/useConversationSearch';
import { buildPlatformGroups } from '@/features/library/sidebarGroups';
import { useGroupCollapse } from '@/features/library/useGroupCollapse';
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
  /**
   * Reveals the import screen (`ui-context.md` 3 → Import entry at sidebar bottom).
   *
   * Unit 13 (FR6): the platform argument is optional. The bottom action passes
   * none, so the flow starts at Step 1 (Choose platform); an empty group's header
   * passes its own platform, so the flow starts at Step 2 with it chosen.
   *
   * Named with `ProviderId`, not the picker's `PlatformOptionId`: the two are the
  * same four literals, but this is the id the Sidebar already carries on every
  * entry, so nothing in `features/` needs to reach into `components/` for a type.
  */
  readonly onImportClick: (platform?: ProviderId) => void;
}

/**
 * The conversation library list (FR4/FR5), grouped by platform since Unit 13.
 *
 * Purely presentational: it receives entries and reports clicks. It never queries
 * storage (FR3) and never renders conversation content (FR10) — the active id is
 * simply reported upward, and the shell decides what fills the main region. That
 * extends to this unit's new state: the collapse choice lives in
 * `useGroupCollapse`, a `features/` hook, so the component still reads and writes
 * nothing itself (FR3).
 *
 * **No list virtualization.** NFR2 forbids adding it preemptively, so rows are
 * rendered plainly until real measurements justify otherwise (ADR: deferred in
 * `architecture.md` 5).
 *
 * Unit 13: rows are no longer one flat list. `buildPlatformGroups` buckets them
 * into the four always-present groups, each rendered by `SidebarGroup`. The
 * groups are derived from the single library emission, so grouping adds no query
 * and no data-model field (NFR2/NFR3), and it cannot reorder on selection because
 * selection emits nothing new (FR3).
 *
 * Unit 07: while a non-empty search term is active, the grouped list is replaced
 * by `SearchResultsList`; clearing the term (or Escape) brings this view straight
 * back — one boolean branch, no reload (FR6/FR7).
 *
 * Unit 12: the header row carries the `LanguageToggle`. The sidebar is the app's
 * only settings-like surface (spec FR4 allows the settings/header slot), and the
 * header is always visible, so the switcher is reachable on the import screen and
 * on an empty library too — not only while a conversation happens to be open.
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
  const { t } = useTranslation();
  const { query, isSearching, matchedIds, setQuery, clearQuery } = search;
  const { isCollapsed, toggleGroup } = useGroupCollapse();

  // Intersection keeps ordering/display data owned by the library emission:
  // ids that left the DB between emissions can never render a stale row.
  const matchedIdSet = useMemo(() => new Set(matchedIds), [matchedIds]);
  const matchedEntries =
    isSearching ? entries.filter((entry) => matchedIdSet.has(entry.id)) : [];

  // Recomputed only when the library emits a new list — never on selection,
  // scroll or toggle — so a group can never reshuffle without a new import (FR3).
  const groups = useMemo(() => buildPlatformGroups(entries), [entries]);

  return (
    <nav className={styles.sidebar} aria-label={t('sidebar.label')}>
      <div className={styles.header}>
        <h2 className={styles.heading}>{t('sidebar.heading')}</h2>
        <LanguageToggle />
      </div>

      {/*
        Loading is not emptiness, and emptiness inside the sidebar is a short hint
        (the full Empty State with its call to action belongs to the main region).

        Unit 13: the four groups are shown even when that hint is up — an empty
        library is not an empty sidebar (FR1), and each empty group is where the
        matching import is offered (FR6).
      */}
      {isLoading ? (
        <p className={styles.status}>{t('sidebar.statusLoading')}</p>
      ) : (
        <>
          {entries.length === 0 && (
            <p className={styles.status}>{t('sidebar.statusEmpty')}</p>
          )}

          {/* Hidden on an empty library: searching has nothing to answer, so it
              defers to Unit 04's Empty State rather than inventing a second one. */}
          {entries.length > 0 && (
            <SearchBar value={query} onChange={setQuery} onClear={clearQuery} />
          )}

          {isSearching ? (
            <SearchResultsList
              entries={matchedEntries}
              activeId={activeId}
              query={query}
              onSelect={onSelect}
              onRequestDelete={onRequestDelete}
            />
          ) : (
            <div className={styles.groups}>
              {groups.map((group) => (
                <SidebarGroup
                  key={group.platform}
                  group={group}
                  activeId={activeId}
                  isCollapsed={isCollapsed(group.platform)}
                  onToggle={() => {
                    toggleGroup(group.platform);
                  }}
                  onSelect={onSelect}
                  onRequestDelete={onRequestDelete}
                  onImportClick={() => {
                    // FR6: the empty group's header names the platform it would
                    // import from, so the flow opens already set up for it.
                    onImportClick(group.platform);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* The bulk action sits beside the import action at the sidebar's foot —
          the one place that is reachable no matter how long the groups get. It is
          offered only when there is something to clear, and it merely *requests*:
          the shell-level dialog decides (FR6/FR7 pattern, ADR #14). */}
      {entries.length > 0 && (
        <button type="button" className={styles.clearAll} onClick={onRequestClearAll}>
          {t('sidebar.clearAll')}
        </button>
      )}

      {/* No platform: this is the generic entry, so it keeps Step 1 — unlike an
          empty group's header, it has no platform to name (FR6). */}
      <button type="button" className={styles.import} onClick={() => onImportClick()}>
        {t('sidebar.addConversation')}
      </button>
    </nav>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SearchIndexEntry } from '@/types/storage';
import { subscribeToSearchIndex } from '@/storage/conversationStore';
import { findMatches } from '@/features/search/searchConversations';
import { logStorageDetail } from '@/features/library/errorMessages';

/**
 * Owns all in-conversation search state (Unit 07).
 *
 * Three rules shape this hook:
 *   - **No Dexie here.** The index arrives through `subscribeToSearchIndex`,
 *     the same callback-based live-subscription seam Unit 04's Sidebar uses —
 *     reusing storage/'s mechanism, never opening a second path to it (ADR #19).
 *     It re-emits on every store change, so imports and deletes keep the index
 *     fresh without any manual refresh.
 *   - **Filtering is synchronous per keystroke** (`useMemo` on the query): the
 *     haystack was case-folded once when the index was built, so each keystroke
 *     costs one substring pass over memory — far inside NFR1/NFR3 without a
 *     debounce timer's added latency.
 *   - **A failed index read degrades silently** to an index of nothing: search
 *     then reports «بدون نتیجه» honestly rather than crashing or faking data.
 *     The technical detail goes to the console via the shared error logger,
 *     never to the UI (`code-standards.md` §5).
 *
 * Like `useLibrary`, this lives one level above the components: `AppShell` calls
 * it once and passes it down, keeping the Sidebar provably free of storage
 * access (FR3) exactly like every other shell-level state owner.
 */

export interface UseConversationSearchResult {
  /** Raw input value, empty string = no active search (FR7). */
  readonly query: string;
  /** True while a non-empty term is active — decides list view vs. result view. */
  readonly isSearching: boolean;
  /** True once the first index emission (success *or* failure) has arrived. */
  readonly isIndexReady: boolean;
  /** Ids of conversations whose title/text/filename matched, in index order. */
  readonly matchedIds: readonly number[];
  /** Replaces the query wholesale (the controlled input's onChange). */
  readonly setQuery: (nextQuery: string) => void;
  /** Empties the query, restoring the normal Sidebar list (FR7). */
  readonly clearQuery: () => void;
}

export function useConversationSearch(): UseConversationSearchResult {
  const [index, setIndex] = useState<readonly SearchIndexEntry[]>([]);
  const [isIndexReady, setIsIndexReady] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const subscription = subscribeToSearchIndex((result) => {
      setIsIndexReady(true);
      if (result.ok) {
        setIndex(result.data);
        return;
      }
      // Console-only detail, per §5: the user sees honest zero-results, not a
      // stack trace — searching must never become a blocking error surface.
      logStorageDetail('search-index', result.error);
      setIndex([]);
    });
    return (): void => {
      subscription.unsubscribe();
    };
  }, []);

  const matchedIds = useMemo(() => findMatches(index, query), [index, query]);

  const clearQuery = useCallback((): void => {
    setQuery('');
  }, []);

  return {
    query,
    isSearching: query !== '',
    isIndexReady,
    matchedIds,
    setQuery,
    clearQuery,
  };
}

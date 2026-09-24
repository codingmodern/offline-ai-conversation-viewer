import type { SearchIndexEntry } from '@/types/storage';

/**
 * Matches a query against the in-memory search index (Unit 07, FR2/FR3/FR5).
 *
 * Pure substring containment after folding both sides with `toLowerCase()` —
 * no regular expressions anywhere, so a query full of regex metacharacters
 * (`.`、`*`、`(`) searches for itself literally instead of throwing or
 * mis-matching. That is also what keeps Persian and other non-Latin text
 * correct: `toLowerCase` is a no-op on caseless scripts, so a query typed the
 * way the text was written matches verbatim, free of `\d`-style ASCII pitfalls.
 *
 * Deliberately **synchronous on each keystroke** rather than debounced: matching
 * is an `includes()` scan over strings that were folded once at index-build time,
 * which even at many multiples of the 133-conversation reference library stays
 * orders of magnitude inside NFR1's 300 ms — a debounce would only add latency.
 *
 * An empty needle (which includes whitespace-only queries trimmed by nothing but
 * compared raw, so `'   '` matches texts containing spaces "naturally") means
 * «no active search» per the spec's Validation table and yields no results; the
 * UI gates rendering on `isSearching` anyway — this guard is defence in depth.
 *
 * Results carry conversation ids in index order; the Sidebar intersects them
 * with its own entries, so display order always follows the library's.
 */
export function findMatches(
  entries: readonly SearchIndexEntry[],
  query: string,
): readonly number[] {
  const needle = query.toLowerCase();
  if (needle === '') {
    return [];
  }

  const matchedIds: number[] = [];
  for (const entry of entries) {
    if (entry.searchableText.includes(needle)) {
      matchedIds.push(entry.conversationId);
    }
  }
  return matchedIds;
}

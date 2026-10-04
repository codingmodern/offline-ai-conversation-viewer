import type { ProviderId } from '@/types/providers';
import type { LibraryEntry } from '@/types/storage';

/**
 * The Sidebar's platform grouping (Unit 13, `13-platform-grouped-sidebar.md`).
 *
 * Why this is a pure function in `features/` rather than logic inside `Sidebar`:
 * the grouping rules — which platforms exist, how groups are ordered, and what an
 * empty group means — are the part of this unit that carries real decisions, and
 * a pure function proves them without rendering anything. It is the same split
 * `selectAfterDelete.ts` and `metadataFields.ts` already use.
 *
 * NFR2: grouping is derived **only** from data the library already emits
 * (`entry.platform`, `entry.importedAt`). No field is added to
 * `UnifiedConversation`/`LibraryEntry`, and no second query is opened — this runs
 * on the single emission Unit 04's live subscription already produces (NFR3).
 */

/**
 * The four groups the Sidebar always shows, in the fixed order FR1 requires.
 *
 * This documented order is doing double duty:
 *   - it is the order of the **empty** groups, for which "latest import" has no
 *     meaning (FR1), and
 *   - it is the deterministic tie-break when two platforms' newest records share
 *     an `importedAt` (spec -> Edge Cases).
 *
 * It is alphabetical by display label (ChatGPT, Claude, DeepSeek, Gemini) — the
 * rule the spec names as its example, "fixed and pre-defined" — and it happens to
 * match the import picker's order. It is exhaustive over `ProviderId` on purpose:
 * `tests/features/sidebarGroups.test.ts` fails until a newly registered provider
 * is added here, so the list cannot silently fall behind the type.
 */
export const PLATFORM_GROUP_ORDER: readonly ProviderId[] = [
  'chatgpt',
  'claude',
  'deepseek',
  'gemini',
];

/** One platform's bucket, as the Sidebar renders it. */
export interface PlatformGroup {
  readonly platform: ProviderId;
  /** That platform's entries, in the order the library emitted them. */
  readonly entries: readonly LibraryEntry[];
  /** How many conversations of this platform the library holds (0 for empty). */
  readonly count: number;
  /**
   * The newest `importedAt` in this bucket — the group's sort key (FR3).
   * Deliberately `0` for an empty bucket, which only ever sorts last anyway.
   */
  readonly latestImportedAt: number;
}

/** Newest import in a bucket, without spreading a possibly huge array into `Math.max`. */
function newestImport(entries: readonly LibraryEntry[]): number {
  let newest = 0;
  for (const entry of entries) {
    if (entry.importedAt > newest) {
      newest = entry.importedAt;
    }
  }
  return newest;
}

interface IndexedGroup {
  readonly index: number;
  readonly group: PlatformGroup;
}

/**
 * Non-empty groups: newest import first, then the fixed order (FR3 + Edge Cases).
 *
 * The secondary key is what makes the ordering *total*: two platforms whose newest
 * imports carry the same millisecond still land in a stable, documented order
 * rather than depending on sort stability or object-key order.
 */
function byNewestImportThenFixedOrder(a: IndexedGroup, b: IndexedGroup): number {
  if (b.group.latestImportedAt !== a.group.latestImportedAt) {
    return b.group.latestImportedAt - a.group.latestImportedAt;
  }
  return a.index - b.index;
}

/**
 * Buckets the library's entries into the platform groups, ordered per FR3.
 *
 * Exactly four groups come back, always: a platform with nothing imported is a
 * group with `count: 0`, never a missing one (FR1), because that empty group is
 * how the user is offered the matching import (FR6).
 *
 * Entries inside a bucket keep the emission's own order (newest-first), so a
 * group's list needs no second sort. FR3's "recomputed only on a new import"
 * falls out of this being derived from the single `entries` emission: selecting a
 * conversation does not produce a new one, so it can never reorder the groups.
 */
export function buildPlatformGroups(entries: readonly LibraryEntry[]): readonly PlatformGroup[] {
  const indexed: readonly IndexedGroup[] = PLATFORM_GROUP_ORDER.map((platform, index) => {
    // Filtering per platform keeps this linear in the library size and preserves
    // the incoming order inside each bucket. Entries of an unregistered provider
    // are ignored: this unit adds no group for a platform nobody registered
    // (spec -> Edge Cases), and the test above keeps the list exhaustive.
    const platformEntries = entries.filter((entry) => entry.platform === platform);
    return {
      index,
      group: {
        platform,
        entries: platformEntries,
        count: platformEntries.length,
        latestImportedAt: newestImport(platformEntries),
      },
    };
  });

  const nonEmpty = indexed
    .filter((item) => item.group.count > 0)
    .sort(byNewestImportThenFixedOrder);
  // FR1/FR3: every empty group follows every non-empty one, keeping fixed order.
  const empty = indexed.filter((item) => item.group.count === 0);

  return [...nonEmpty, ...empty].map((item) => item.group);
}
import Dexie, { liveQuery, type Subscription } from 'dexie';
import type { UnifiedConversation } from '@/types/conversation';
import {
  storageFailure,
  storageSuccess,
  type LibraryEntry,
  type SearchIndexEntry,
  type StorageErrorCode,
  type StorageResult,
  type StoredConversation,
} from '@/types/storage';
import { db, type LibraryDatabase } from '@/storage/db';
import { findDuplicate } from '@/storage/duplicateKey';
import { isStorableConversation } from '@/storage/validateConversation';
import { buildSearchableText } from '@/storage/searchableText';

/**
 * The library's public API — the single doorway between the app and IndexedDB
 * (FR3, `code-standards.md` §4 → Storage Access).
 *
 * Every function returns a `StorageResult` and never throws, so a Dexie failure
 * cannot bubble into a component and crash the app (`code-standards.md` §5 →
 * Fail Gracefully). Dexie types stay behind this boundary: callers receive
 * `LibraryEntry` / `UnifiedConversation`, never a `Table` or a `Dexie` instance.
 *
 * Every function takes the database as an optional parameter, defaulting to the
 * shared instance. That is what lets the tests drive a throwaway database (and
 * an injected failure) without stubbing the module itself.
 */

/** What `saveConversation` did, so callers can tell a write from a refusal. */
export type SaveOutcome =
  | { readonly status: 'saved'; readonly id: number }
  /**
   * A duplicate exists and nothing was written (FR8). Since ADR #13 the caller
   * does not ask the user about it either: it counts the skip for the batch
   * summary instead. There is deliberately **no way** to store a duplicate
   * through this API — the natural key guarantees an identical conversation id,
   * so a second copy could only ever be noise.
   */
  | { readonly status: 'duplicate' };

/**
 * Persists one conversation (FR1/FR2).
 *
 * Duplicate check and insert share a **single read-write transaction**, so:
 *   - the library can never end up with a half-written record (spec → Edge Cases:
 *     a browser closed mid-save leaves either a complete record or nothing), and
 *   - no concurrent import can slip between the check and the insert.
 *
 * On any failure the transaction aborts and the existing library is byte-identical
 * to what it was before the call.
 */
export async function saveConversation(
  conversation: UnifiedConversation,
  database: LibraryDatabase = db,
): Promise<StorageResult<SaveOutcome>> {
  // Guard before opening a transaction: a malformed record should cost nothing.
  if (!isStorableConversation(conversation)) {
    return storageFailure(
      'InvalidConversationError',
      'Conversation is missing sourceProvider, sourceConversationId or messages.',
    );
  }

  try {
    return await database.transaction('rw', database.conversations, async () => {
      const existing = await findDuplicate(database.conversations, conversation);
      if (existing !== undefined) {
        // Reporting instead of writing is the whole point of FR8: nothing may
        // silently clone or overwrite a stored conversation (ADR #13 decides what
        // the UI does with the report — skip and summarize, never ask per item).
        return storageSuccess<SaveOutcome>({ status: 'duplicate' });
      }

      // `id` is omitted: Dexie assigns the auto-increment key on insert.
      const record: Omit<StoredConversation, 'id'> = {
        // Query-helper mirrors (FR1) — derived here so the caller cannot set them
        // inconsistently with the conversation itself.
        platform: conversation.sourceProvider,
        sourceConversationId: conversation.sourceConversationId,
        importedAt: Date.now(),
        conversation,
      };

      const id = await database.conversations.add(record);

      return storageSuccess<SaveOutcome>({ status: 'saved', id });
    });
  } catch (error) {
    return storageFailure(classifyWriteError(error), describe(error));
  }
}

/**
 * Lists the library for the Sidebar (FR4), newest import first.
 *
 * Returns `LibraryEntry` rather than whole conversations: a list row needs a
 * title, a platform and a timestamp, not the messages of every stored export.
 *
 * Ordered by `importedAt` descending because it is the only timestamp guaranteed
 * to exist — `createdAt`/`updatedAt` are optional in the unified model (ADR #8),
 * so sorting on them would place undated records arbitrarily.
 */
export async function listConversations(
  database: LibraryDatabase = db,
): Promise<StorageResult<readonly LibraryEntry[]>> {
  try {
    const records = await database.conversations.orderBy('importedAt').reverse().toArray();
    return storageSuccess(records.map(toLibraryEntry));
  } catch (error) {
    return storageFailure('StorageReadError', describe(error));
  }
}

/**
 * Loads one full conversation by id — the hand-off point to Unit 06 (FR10).
 *
 * A missing id is a successful read of nothing (`undefined`), not an error: the
 * record may have been deleted in another tab, which is normal, not a fault.
 */
export async function getConversation(
  id: number,
  database: LibraryDatabase = db,
): Promise<StorageResult<UnifiedConversation | undefined>> {
  try {
    const record = await database.conversations.get(id);
    return storageSuccess(record?.conversation);
  } catch (error) {
    return storageFailure('StorageReadError', describe(error));
  }
}

/**
 * Removes a conversation from IndexedDB completely (FR6).
 *
 * The confirmation itself is the UI's responsibility (FR7): this function is only
 * ever reached after the user has explicitly confirmed.
 */
export async function deleteConversation(
  id: number,
  database: LibraryDatabase = db,
): Promise<StorageResult<void>> {
  try {
    await database.conversations.delete(id);
    return storageSuccess(undefined);
  } catch (error) {
    return storageFailure('StorageDeleteError', describe(error));
  }
}

/**
 * Removes every conversation from the library in **one atomic transaction** (FR2).
 *
 * The bulk action behind "حذف همه‌ی گفتگوها" (ADR #14): like every other write it
 * either fully succeeds or leaves the library byte-identical — a failure midway
 * can never strand half a cleared library. Clearing an already-empty library
 * succeeds as a no-op, so a double click cannot fail on the second pass.
 */
export async function clearLibrary(
  database: LibraryDatabase = db,
): Promise<StorageResult<void>> {
  try {
    await database.transaction('rw', database.conversations, async () => {
      await database.conversations.clear();
    });
    return storageSuccess(undefined);
  } catch (error) {
    return storageFailure('StorageDeleteError', describe(error));
  }
}

/** Number of stored conversations. Used to tell "empty library" from "failed read". */
export async function countConversations(
  database: LibraryDatabase = db,
): Promise<StorageResult<number>> {
  try {
    return storageSuccess(await database.conversations.count());
  } catch (error) {
    return storageFailure('StorageReadError', describe(error));
  }
}

/**
 * Subscribes to the library, re-emitting the whole list on every change.
 *
 * Why this exists instead of `useLiveQuery` in a component: `code-standards.md`
 * §3 allows "`useLiveQuery` or equivalent", and FR3 forbids UI code from touching
 * Dexie. Wrapping Dexie's own `liveQuery()` here keeps that rule absolute — the
 * React hook in `features/library/` consumes this callback API and never imports
 * Dexie — and avoids a third dependency (`dexie-react-hooks`).
 *
 * Errors are delivered through the same callback as data, so a subscriber handles
 * failure exactly as it handles a normal emission.
 */
export function subscribeToLibrary(
  onChange: (result: StorageResult<readonly LibraryEntry[]>) => void,
  database: LibraryDatabase = db,
): Subscription {
  const query = liveQuery(async () => {
    const records = await database.conversations.orderBy('importedAt').reverse().toArray();
    return records.map(toLibraryEntry);
  });

  return query.subscribe({
    next: (entries) => {
      onChange(storageSuccess(entries));
    },
    error: (error: unknown) => {
      onChange(storageFailure('StorageReadError', describe(error)));
    },
  });
}

/**
 * Subscribes to the library's search index (Unit 07), re-emitting it on every
 * change.
 *
 * Same mechanism as `subscribeToLibrary`, on purpose and with a separate
 * function (ADR #19): a `liveQuery()` wrapped behind this boundary is what keeps
 * FR3 absolute — `features/search/` consumes this callback API and never imports
 * Dexie. A dedicated projection instead of widening `LibraryEntry` exists because
 * the Sidebar list needs display metadata while search needs joined message
 * content; shipping both in one shape would carry the whole text corpus through
 * every Sidebar re-render whether or not any search is active.
 *
 * The returned rows are projected by `toSearchIndexEntry`, whose text is already
 * case-folded so per-keystroke filtering never re-folds the corpus (NFR1).
 */
export function subscribeToSearchIndex(
  onChange: (result: StorageResult<readonly SearchIndexEntry[]>) => void,
  database: LibraryDatabase = db,
): Subscription {
  const query = liveQuery(async () => {
    const records = await database.conversations.orderBy('importedAt').reverse().toArray();
    return records.map(toSearchIndexEntry);
  });

  return query.subscribe({
    next: (entries) => {
      onChange(storageSuccess(entries));
    },
    error: (error: unknown) => {
      onChange(storageFailure('StorageReadError', describe(error)));
    },
  });
}

/**
 * Projects a stored record onto the Sidebar's view of it.
 *
 * `title` is omitted rather than defaulted when the export carried none: choosing
 * the fallback label is a UI decision (`ui-context.md`), and `exactOptionalProperty
 * Types` keeps `'title' in entry` meaningful.
 */
function toLibraryEntry(record: StoredConversation): LibraryEntry {
  return {
    // Always present on a record read back from Dexie, which assigns it on insert.
    id: record.id,
    platform: record.platform,
    importedAt: record.importedAt,
    ...(record.conversation.title === undefined ? {} : { title: record.conversation.title }),
    messageCount: record.conversation.messages.length,
  };
}

/**
 * Projects a stored record onto the search index's view of it (Unit 07).
 *
 * Mirrors `toLibraryEntry`: one function per consumer, so neither the Sidebar's
 * shape nor search's can drift into carrying what the other needs.
 */
function toSearchIndexEntry(record: StoredConversation): SearchIndexEntry {
  return {
    conversationId: record.id,
    ...(record.conversation.title === undefined ? {} : { title: record.conversation.title }),
    searchableText: buildSearchableText(record.conversation),
  };
}

/**
 * Tells an exhausted quota apart from any other write failure.
 *
 * Worth distinguishing because only this case has actionable advice for the user
 * ("delete old conversations" — `architecture.md` §7). Dexie wraps the browser's
 * `QuotaExceededError` in its own `QuotaExceededError`, and a plain `DOMException`
 * can also surface, so both spellings are matched.
 */
function classifyWriteError(error: unknown): StorageErrorCode {
  if (error instanceof Dexie.DexieError && error.name === 'QuotaExceededError') {
    return 'StorageQuotaError';
  }
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return 'StorageQuotaError';
  }
  return 'StorageWriteError';
}

/** Extracts console-safe technical detail; never shown to the user (§5). */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Read-only duplicate math for the guided import's Step 3 preview (Unit 08 FR10). */
export interface DuplicateCounts {
  readonly newCount: number;
  readonly duplicateCount: number;
}

/**
 * Counts how many of `conversations` are already stored — **without writing**.
 *
 * Uses the exact same `findDuplicate` rule as the save transaction (Unit 04), so
 * the preview can never promise a number the save would contradict. Read-only
 * and never throws, like every function in this module.
 */
export async function countDuplicates(
  conversations: readonly UnifiedConversation[],
  database: LibraryDatabase = db,
): Promise<StorageResult<DuplicateCounts>> {
  try {
    let duplicateCount = 0;
    for (const conversation of conversations) {
      const existing = await findDuplicate(database.conversations, conversation);
      if (existing !== undefined) {
        duplicateCount += 1;
      }
    }
    return storageSuccess({
      newCount: conversations.length - duplicateCount,
      duplicateCount,
    });
  } catch (error) {
    return storageFailure('StorageReadError', describe(error));
  }
}

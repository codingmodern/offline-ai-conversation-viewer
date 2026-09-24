import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';

/**
 * Shared model for the local library layer (`04-local-chat-library.md`).
 *
 * Why a separate file from `types/errors.ts`: that module models the *import
 * pipeline* (read → validate → detect → parse). A storage failure has different
 * causes, different recovery advice and a different audience, so mixing the two
 * unions would make `ParseErrorCode` mean "anything that can go wrong anywhere".
 * `types/errors.ts` is also a protected file (`ai-workflow-rules.md` §6).
 *
 * The `{ ok: true } | { ok: false }` shape deliberately mirrors `ParseResult` so
 * both layers are consumed identically (`code-standards.md` §2 — no untyped
 * throw ever reaches the UI).
 */

/** Categories of failure the storage layer can produce. */
export type StorageErrorCode =
  /**
   * The browser refused the write because its IndexedDB quota is exhausted.
   * Distinct from a generic write failure because the user *can* act on it by
   * deleting old conversations (`architecture.md` §7 → Edge Cases).
   */
  | 'StorageQuotaError'
  /** A write (insert) failed for any other reason — transaction aborted, DB blocked. */
  | 'StorageWriteError'
  /** A read (list / get / count) failed. */
  | 'StorageReadError'
  /** A delete failed. */
  | 'StorageDeleteError'
  /**
   * The object handed in is not a usable `UnifiedConversation`.
   *
   * This unit trusts Unit 03's output but still performs a shallow guard before
   * writing (spec → Validation), so a bad record can never enter the library.
   */
  | 'InvalidConversationError';

/**
 * A typed storage failure.
 *
 * `detail` is console-only diagnostic text and is never rendered
 * (`code-standards.md` §5); the UI shows the mapped message instead.
 */
export interface StorageError {
  readonly code: StorageErrorCode;
  readonly detail?: string;
}

/** Discriminated result returned by every `storage/` operation. */
export type StorageResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: StorageError };

/** Builds a failed `StorageResult`. */
export function storageFailure<T>(code: StorageErrorCode, detail?: string): StorageResult<T> {
  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
  // property, so `detail` is only included when it actually has a value.
  return { ok: false, error: detail === undefined ? { code } : { code, detail } };
}

/** Builds a successful `StorageResult`. */
export function storageSuccess<T>(data: T): StorageResult<T> {
  return { ok: true, data };
}

/**
 * A conversation as it lives in IndexedDB (FR1).
 *
 * The full `UnifiedConversation` is stored verbatim under `conversation`, with
 * `platform` and `importedAt` mirrored to the top level purely as **query
 * helpers**: IndexedDB can only index top-level properties, so the Sidebar's
 * ordering and the duplicate lookup would otherwise require loading and
 * scanning every record.
 *
 * The mirrors are derived, never authoritative — `conversation.sourceProvider`
 * remains the source of truth for the platform.
 */
export interface StoredConversation {
  /**
   * Surrogate auto-increment key, assigned by Dexie.
   *
   * Deliberately *not* the natural key `(sourceProvider, sourceConversationId)` —
   * even though ADR #13 removed the last flow that wrote two rows sharing it.
   * Libraries created under ADR #9's old "Add anyway" answer may already hold
   * twin-keyed records, so the schema (and this surrogate key) stay unchanged
   * rather than forcing a migration on existing data.
   *
   * Declared as required because that is what every record *read back* has;
   * inserts omit it (see `conversationStore.saveConversation`, which builds an
   * `Omit<StoredConversation, 'id'>`). Typing it optional here would make Dexie
   * infer the primary key as `number | undefined` and lose type safety on lookups.
   */
  readonly id: number;
  /** Query-helper mirror of `conversation.sourceProvider` (indexed). */
  readonly platform: ProviderId;
  /** Query-helper mirror of `conversation.sourceConversationId` (compound-indexed). */
  readonly sourceConversationId: string;
  /**
   * When this record entered the library, as epoch milliseconds.
   *
   * Owned by this unit rather than taken from the export, and the Sidebar's sort
   * key: it is the only timestamp guaranteed to exist, since `createdAt` and
   * `updatedAt` are optional in the unified model (ADR #8).
   */
  readonly importedAt: number;
  /** The unified conversation, unchanged — nothing is reinterpreted on the way in. */
  readonly conversation: UnifiedConversation;
}

/**
 * One row of the in-memory search index Unit 07 filters against (ADR #19).
 *
 * Why this is a separate projection instead of widening `LibraryEntry`: the
 * Sidebar list only ever needs display metadata, while search needs the joined
 * *content* of every message. Bundling both into one shape would ship the full
 * text corpus to every Sidebar re-render whether or not any search is active,
 * so each consumer gets its own minimal view of the same stored records.
 *
 * `searchableText` arrives already **case-folded** by the producer
 * (`conversationStore.subscribeToSearchIndex`): folding once per library
 * emission amortises the cost, whereas folding the whole corpus on every
 * keystroke would defeat the in-memory index and threaten NFR1 (300 ms).
 */
export interface SearchIndexEntry {
  /** Dexie surrogate key — the same id `selectConversation` expects (FR4). */
  readonly conversationId: number;
  /** Raw conversation title when the export carried one; folded into the text too. */
  readonly title?: string;
  /**
   * Title + every `kind: 'text'` message body + every attachment `fileName`,
   * newline-joined and lowercased. `tool_activity` payloads are deliberately
   * never read here (ADR #18 — undocumented inner shape).
   */
  readonly searchableText: string;
}

/**
 * A library entry as the Sidebar needs it (FR4).
 *
 * Exposed so list rendering never has to receive whole conversations: the
 * message array of a large export is irrelevant to a list row. Unit 06 asks for
 * the full record by `id` when a conversation actually becomes active.
 */
export interface LibraryEntry {
  readonly id: number;
  readonly platform: ProviderId;
  readonly importedAt: number;
  /** Absent when the export carried no title; the UI supplies a fallback label. */
  readonly title?: string;
  /** Message count, precomputed so the Sidebar need not hold the messages themselves. */
  readonly messageCount: number;
}

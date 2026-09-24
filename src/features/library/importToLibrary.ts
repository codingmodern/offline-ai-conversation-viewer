import type { UnifiedConversation } from '@/types/conversation';
import type { StorageError } from '@/types/storage';
import { saveConversation } from '@/storage/conversationStore';

/**
 * Bridges Unit 03's output into the library (spec → Dependencies: "Unit 03 →
 * normalized conversation objects to store").
 *
 * A single file can yield several conversations (a DeepSeek export is an array),
 * so this walks the batch and sorts each conversation into one of three buckets:
 * saved, skipped-as-duplicate, failed. Since ADR #13 a duplicate is **skipped
 * automatically** instead of being asked about per item — which still honours
 * FR9's spirit ("no silent automatic ADD") because nothing is ever silently
 * *added*: the natural key guarantees an identical `sourceConversationId`, so
 * re-storing could only create noise, and per-item confirmation does not scale
 * to large batches. The batch ends with counts that the shell reports in ONE
 * summary.
 *
 * Two conversations in the *same* file that share a natural key resolve without a
 * special case: the first is written, and the second then finds the first already
 * stored and joins the skipped count.
 *
 * Lives in `features/` rather than `storage/` because it is orchestration — it
 * owns the batch loop and its summary — while `storage/` decides *what is a
 * duplicate*.
 */

/** A conversation refused because its natural key is already stored (ADR #13). */
export interface DuplicateSkip {
  /** Stable key over FR8's natural key: `${sourceProvider}:${sourceConversationId}`. */
  readonly key: string;
}

/** A conversation that could not be stored, paired with its failure. */
export interface FailedImport {
  readonly conversation: UnifiedConversation;
  readonly error: StorageError;
}

export interface ImportToLibraryResult {
  /** Ids of conversations written during this call. */
  readonly savedIds: readonly number[];
  /** Duplicates that were skipped — nothing was written for these (ADR #13). */
  readonly skippedDuplicates: readonly DuplicateSkip[];
  /** Failures, each already carrying a typed `StorageError`. */
  readonly failures: readonly FailedImport[];
}

/**
 * Saves a batch of conversations, skipping duplicates and collecting failures.
 *
 * Conversations are saved **sequentially**, not with `Promise.all`: each save opens
 * its own transaction, and a parallel batch could let two records with the same
 * natural key pass their duplicate checks simultaneously and both get written.
 *
 * One conversation failing never stops the rest — the same per-item independence
 * Unit 01 established for files (FR8 of `01-import-validation.md`).
 */
export async function importToLibrary(
  conversations: readonly UnifiedConversation[],
): Promise<ImportToLibraryResult> {
  const savedIds: number[] = [];
  const skippedDuplicates: DuplicateSkip[] = [];
  const failures: FailedImport[] = [];

  for (const conversation of conversations) {
    const result = await saveConversation(conversation);

    if (!result.ok) {
      failures.push({ conversation, error: result.error });
      continue;
    }

    if (result.data.status === 'duplicate') {
      // Silent skip (ADR #13): counted for the batch summary, never written,
      // never prompted for. There is no "Add anyway" escape hatch any more.
      skippedDuplicates.push({
        key: `${conversation.sourceProvider}:${conversation.sourceConversationId}`,
      });
      continue;
    }

    savedIds.push(result.data.id);
  }

  return { savedIds, skippedDuplicates, failures };
}

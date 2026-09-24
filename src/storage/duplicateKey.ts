import type { EntityTable } from 'dexie';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';
import type { StoredConversation } from '@/types/storage';

/**
 * Duplicate detection — **v1 algorithm, deliberately isolated in this file**.
 *
 * FR8 requires that "the exact algorithm ... be able to evolve without changing
 * this spec or any upstream component". That requirement is met structurally:
 * this module is the only place that knows *what makes two conversations the
 * same*. `conversationStore.ts` calls it without knowing the rule, and no UI
 * component imports it at all. Replacing the rule (e.g. adding a content hash for
 * exports whose id changes between downloads) means editing this file only.
 *
 * **v1 rule (ADR #9):** a conversation is a duplicate of an existing record when
 * both `sourceProvider` *and* `sourceConversationId` match. Both halves are
 * required — provider ids are only unique within a platform, so two platforms
 * could legitimately issue the same conversation id.
 */

/** The value pair that identifies a conversation for duplicate purposes. */
export interface DuplicateKey {
  readonly platform: ProviderId;
  readonly sourceConversationId: string;
}

/**
 * Derives the duplicate key from a conversation.
 *
 * Read straight off the unified model — never from the file name, import time or
 * anything the user could change between two imports of the same conversation.
 */
export function buildDuplicateKey(conversation: UnifiedConversation): DuplicateKey {
  return {
    platform: conversation.sourceProvider,
    sourceConversationId: conversation.sourceConversationId,
  };
}

/**
 * Finds an already-stored record equivalent to `conversation`, or `undefined`.
 *
 * Takes the `Table` as a parameter rather than importing `db` so it can run
 * inside the caller's transaction: checking and inserting must be one atomic
 * step (FR2), otherwise a second import could slip in between them.
 *
 * The lookup rides the `[platform+sourceConversationId]` compound index, so cost
 * does not grow with library size.
 */
export async function findDuplicate(
  conversations: EntityTable<StoredConversation, 'id'>,
  conversation: UnifiedConversation,
): Promise<StoredConversation | undefined> {
  const key = buildDuplicateKey(conversation);

  return conversations
    .where('[platform+sourceConversationId]')
    .equals([key.platform, key.sourceConversationId])
    .first();
}

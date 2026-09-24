import type { UnifiedConversation } from '@/types/conversation';

/**
 * Shallow entry guard for the storage layer (spec → Validation).
 *
 * This unit *trusts* Unit 03: `normalization/` is the only producer of
 * `UnifiedConversation`, and re-validating every message here would duplicate the
 * parser's job and slow every write on a large export.
 *
 * What it does guard is the boundary contract — the three fields the library
 * itself depends on:
 *   - `sourceProvider` + `sourceConversationId` are the duplicate key and the
 *     compound index; a missing or non-string value would corrupt the index and
 *     make the record unfindable.
 *   - `messages` must be an array, because the Sidebar reports a message count and
 *     Unit 06 iterates it.
 *
 * Message *contents* are deliberately not inspected: an empty array is a valid
 * conversation (a DeepSeek export whose `mapping` holds only the root parses to
 * exactly that — see Unit 03's edge cases).
 */
export function isStorableConversation(value: unknown): value is UnifiedConversation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<UnifiedConversation>;

  return (
    typeof candidate.sourceProvider === 'string' &&
    candidate.sourceProvider.length > 0 &&
    typeof candidate.sourceConversationId === 'string' &&
    candidate.sourceConversationId.length > 0 &&
    Array.isArray(candidate.messages)
  );
}

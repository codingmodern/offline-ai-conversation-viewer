import { useEffect, useState } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import type { StorageResult } from '@/types/storage';
import { getConversation } from '@/storage/conversationStore';

/** What the conversation renderer needs for the active record. */
export interface UseActiveConversationResult {
  /**
   * The full unified conversation, or `undefined` while the async read is in
   * flight, when nothing is selected, or when the read failed/vanished — the
   * renderer shows its own themed empty state instead of an error (FR4-style
   * degradation; a missing id is an empty read per `getConversation`'s contract).
   */
  readonly conversation: UnifiedConversation | undefined;
}

/**
 * Resolves the active conversation's full record through `storage/` (FR3: no
 * Dexie outside `storage/`).
 *
 * Unit 06's counterpart of `useActiveConversationMetadata`: `LibraryEntry`
 * deliberately carries only the Sidebar's projection, so the message list must
 * be fetched when a conversation actually becomes active. Same degradation and
 * staleness rules: reset on selection change so the previous record's messages
 * never flash, and cancel stale reads via a cleanup flag so a slow response for
 * a previously selected record can never overwrite the current one's.
 */
export function useActiveConversation(
  activeId: number | undefined,
): UseActiveConversationResult {
  const [conversation, setConversation] = useState<UnifiedConversation | undefined>(
    undefined,
  );

  useEffect((): (() => void) | undefined => {
    // Reset first so switching selections never shows the previous
    // conversation's content while the next read is in flight (NFR2).
    setConversation(undefined);
    if (activeId === undefined) {
      return undefined;
    }

    let cancelled = false;
    void getConversation(activeId).then(
      (result: StorageResult<UnifiedConversation | undefined>): void => {
        if (cancelled) {
          return;
        }
        setConversation(result.ok ? result.data : undefined);
      },
    );

    return (): void => {
      cancelled = true;
    };
  }, [activeId]);

  return { conversation };
}

import { useEffect, useState } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import type { StorageResult } from '@/types/storage';
import { getConversation } from '@/storage/conversationStore';
import {
  resolveMetadataFields,
  type ResolvedMetadataField,
} from '@/features/library/metadataFields';

/** What the shell needs to render the Metadata Panel for the active record. */
export interface UseActiveConversationMetadataResult {
  /**
   * Present fields only, ready to render. Empty (not `undefined`) while loading
   * and when nothing extra could be resolved — the panel still shows its
   * always-on facts (message count, platform), so no branch of the shell blocks
   * on this hook (FR4).
   */
  readonly fields: readonly ResolvedMetadataField[];
}

/**
 * Resolves the active conversation-level metadata through `storage/` (FR3:
 * no Dexie outside `storage/`).
 *
 * Why a hook instead of reading inside `AppShell`: the full record lives behind
 * an async `getConversation(id)` read — `LibraryEntry` intentionally carries
 * only the Sidebar's projection — and side effects belong in a hook
 * (`code-standards.md` §3).
 *
 * Degradation rules, per FR4 and the storage contract:
 *   - failed read → empty fields (the panel keeps its always-on rows);
 *   - record vanished out-of-band between selection and read → empty fields
 *     too, because a missing id is an empty read, not an error (`getConversation`);
 *   - switching conversations cancels the stale read via a cleanup flag, so a
 *     slow response for a previously selected record can never overwrite the
 *     current one's fields.
 */
export function useActiveConversationMetadata(
  activeId: number | undefined,
): UseActiveConversationMetadataResult {
  const [fields, setFields] = useState<readonly ResolvedMetadataField[]>([]);

  useEffect(() => {
    // Reset first so switching selections never shows the previous record's
    // metadata while the next read is in flight.
    setFields([]);
    if (activeId === undefined) {
      return;
    }

    let cancelled = false;
    void getConversation(activeId).then(
      (result: StorageResult<UnifiedConversation | undefined>): void => {
        if (cancelled) {
          return;
        }
        const conversation = result.ok ? result.data : undefined;
        setFields(conversation === undefined ? [] : resolveMetadataFields(conversation));
      },
    );

    return (): void => {
      cancelled = true;
    };
  }, [activeId]);

  return { fields };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import type { LibraryEntry } from '@/types/storage';
import type { ProviderId } from '@/types/providers';
import type { UserMessage } from '@/i18n/messages';
import {
  clearLibrary,
  deleteConversation,
  subscribeToLibrary,
  type SaveOutcome,
} from '@/storage/conversationStore';
import { checkStorageQuota } from '@/storage/quota';
import { importToLibrary } from '@/features/library/importToLibrary';
import { selectAfterDelete } from '@/features/library/selectAfterDelete';
import { formatImportSummary } from '@/features/library/importSummary';
import { logStorageDetail, toStorageMessage } from '@/features/library/errorMessages';

/**
 * Owns all library state (FR4/FR5/FR6/FR8).
 *
 * Three rules shape this hook:
 *   - **No Dexie here.** Everything goes through `storage/`, so FR3 holds even
 *     though this is the layer that reacts to database changes.
 *   - **No destructive action is taken silently.** Deletes wait for a
 *     confirmation (FR6/FR7), and so does the bulk clear-all (ADR #14); this hook
 *     only records *what is being asked* and performs the answer.
 *   - **Duplicates are never asked about** (ADR #13): `addConversations` skips
 *     them inside the batch and reports both counts once through a summary —
 *     nothing is silently *added*, which is what FR9 actually forbids.
 *
 * Selection is plain React state, which is what satisfies FR5: switching the
 * active conversation is a re-render, never a navigation or a reload.
 */

/** A delete awaiting confirmation (FR7). Holds the label so the dialog can name it. */
export interface PendingDelete {
  readonly id: number;
  readonly title?: string;
}

export interface UseLibraryResult {
  readonly entries: readonly LibraryEntry[];
  /** `undefined` = no conversation selected. It does **not** mean "show import". */
  readonly activeId: number | undefined;
  /**
   * True when the user explicitly asked for the import screen.
   *
   * Tracked separately from `activeId` on purpose: "nothing is selected" and "I
   * want to import" are different facts, and conflating them made the import
   * action a no-op whenever nothing happened to be selected.
   */
  readonly isImporting: boolean;
  /**
   * The platform the open import screen should start pre-selected with (Unit 13
   * FR6), or `undefined` for the generic entry points, which begin at Step 1.
   *
   * Paired with `isImporting` rather than merged into it for the same reason
   * `isImporting` is its own flag: "show import" and "show import *for ChatGPT*"
   * are two different requests, and only one of them skips Step 1. Read by
   * `AppShell` at the moment the import screen mounts.
   */
  readonly importPlatform: ProviderId | undefined;
  /** True until the first emission arrives, so the UI can avoid a false Empty State. */
  readonly isLoading: boolean;
  /**
   * Translatable, user-facing message; never raw `error.detail`
   * (`code-standards.md` §5). A descriptor rather than finished text, so a
   * language switch re-renders the banner instead of freezing it (Unit 12).
   */
  readonly errorMessage: UserMessage | undefined;
  /** True when storage is ≥90% full and the browser supports estimates (Decision 3). */
  readonly isStorageNearLimit: boolean;
  readonly pendingDelete: PendingDelete | undefined;
  /**
   * One summary per import batch that contained skipped duplicates (ADR #13).
   * `undefined` = nothing to report; a clean batch stays silent because its last
   * conversation activating already confirms the import worked.
   */
  readonly importSummary: UserMessage | undefined;
  /** True while the "delete everything" confirmation is on screen (ADR #14). */
  readonly isClearAllPending: boolean;
  readonly selectConversation: (id: number) => void;
  readonly openImport: (platform?: ProviderId) => void;
  readonly closeImport: () => void;
  readonly requestDelete: (id: number) => void;
  readonly confirmDelete: () => void;
  readonly cancelDelete: () => void;
  readonly addConversations: (conversations: readonly UnifiedConversation[]) => Promise<void>;
  readonly dismissImportSummary: () => void;
  readonly requestClearAll: () => void;
  readonly confirmClearAll: () => void;
  readonly cancelClearAll: () => void;
  readonly dismissError: () => void;
}

export function useLibrary(): UseLibraryResult {
  const [entries, setEntries] = useState<readonly LibraryEntry[]>([]);
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const [isImporting, setIsImporting] = useState(false);
  const [importPlatform, setImportPlatform] = useState<ProviderId | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<UserMessage | undefined>(undefined);
  const [isStorageNearLimit, setIsStorageNearLimit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | undefined>(undefined);
  const [importSummary, setImportSummary] = useState<UserMessage | undefined>(undefined);
  const [isClearAllPending, setIsClearAllPending] = useState(false);

  /**
   * Mirror of `entries` for use inside callbacks.
   *
   * `confirmDelete` must read the order that is on screen *at click time*; closing
   * over `entries` would either capture a stale array or force the callback to be
   * recreated on every emission.
   */
  const entriesRef = useRef<readonly LibraryEntry[]>([]);
  entriesRef.current = entries;

  /** Live subscription: any change to the library re-renders the Sidebar (FR4). */
  useEffect(() => {
    const subscription = subscribeToLibrary((result) => {
      setIsLoading(false);

      if (!result.ok) {
        logStorageDetail('subscribe', result.error);
        setErrorMessage(toStorageMessage(result.error));
        return;
      }

      setEntries(result.data);
    });

    return (): void => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Initial selection (ADR #12): loading over a non-empty library activates the
   * newest conversation instead of resting on "nothing selected" — a state whose
   * only render was the Empty State, which told users with saved data that their
   * library was empty. Sidebar order is newest-first, so `[0]` is the newest.
   *
   * Scoped to the first load by construction: any later `activeId` is user-owned
   * (FR5) or set by an import (below), and an emptied library leaves `activeId`
   * alone so the post-delete Empty State can show.
   */
  useEffect(() => {
    const newest = entries[0];
    if (!isLoading && activeId === undefined && newest !== undefined) {
      setActiveId(newest.id);
    }
  }, [isLoading, activeId, entries]);

  /** Re-checks quota after each change, since a large import can cross the line. */
  const refreshQuota = useCallback((): void => {
    void checkStorageQuota().then((status) => {
      // `supported: false` deliberately leaves the flag untouched-false: no
      // estimate means no proactive warning (Decision 3).
      setIsStorageNearLimit(status.supported && status.nearLimit);
    });
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota, entries.length]);

  const selectConversation = useCallback((id: number): void => {
    // State only — no router, no reload (FR5).
    setActiveId(id);
    // Choosing a conversation to read is also how the import screen is left.
    setIsImporting(false);
  }, []);

  const openImport = useCallback((platform?: ProviderId): void => {
    // An explicit flag, so the request works no matter what is selected — and
    // regardless of whether the library is empty.
    //
    // Unit 13 (FR6): both setters run in one event handler, so they batch into a
    // single render — `AppShell` never sees `isImporting` true alongside a stale
    // `importPlatform`, which is what lets the flow rely on reading the platform
    // once, at mount.
    setImportPlatform(platform);
    setIsImporting(true);
  }, []);

  const closeImport = useCallback((): void => {
    setIsImporting(false);
    // Leaving the screen retires the platform too, so a later generic open
    // cannot inherit this one's choice.
    setImportPlatform(undefined);
    // Cancelling has to land somewhere real: with nothing selected, fall back to
    // the first conversation in Sidebar order rather than leaving a blank pane.
    setActiveId((current) => current ?? entriesRef.current[0]?.id);
  }, []);

  const requestDelete = useCallback((id: number): void => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id);
    // Recording the request is all that happens here; nothing is removed until
    // `confirmDelete` runs (FR6/FR7 — no silent deletion).
    setPendingDelete(entry?.title === undefined ? { id } : { id, title: entry.title });
  }, []);

  const cancelDelete = useCallback((): void => {
    setPendingDelete(undefined);
  }, []);

  const confirmDelete = useCallback((): void => {
    const target = pendingDelete;
    if (target === undefined) {
      return;
    }
    setPendingDelete(undefined);

    // Computed *before* the delete, because the rule needs the pre-delete order to
    // know which entry is "next" (ADR #10).
    const orderedIds = entriesRef.current.map((entry) => entry.id);
    const wasActive = activeId === target.id;

    void deleteConversation(target.id).then((result) => {
      if (!result.ok) {
        logStorageDetail('delete', result.error);
        setErrorMessage(toStorageMessage(result.error));
        return;
      }

      // A non-active row disappearing must not move the user's selection.
      if (wasActive) {
        setActiveId(selectAfterDelete(orderedIds, target.id));
      }
      // The list itself refreshes through the live subscription.
    });
  }, [activeId, pendingDelete]);

  const addConversations = useCallback(
    async (conversations: readonly UnifiedConversation[]): Promise<void> => {
      const result = await importToLibrary(conversations);

      // ADR #13: duplicates were skipped silently inside the batch; ONE summary
      // reports both counts afterwards. A batch with no duplicates stays silent —
      // activating its last conversation below already shows the import worked.
      if (result.skippedDuplicates.length > 0) {
        setImportSummary(
          formatImportSummary(result.savedIds.length, result.skippedDuplicates.length),
        );
      }

      const failure = result.failures[0];
      if (failure !== undefined) {
        logStorageDetail('save', failure.error);
        setErrorMessage(toStorageMessage(failure.error));
      }

      // ADR #12: a batch that saved anything redirects attention to what it just
      // added — the LAST conversation saved in this batch becomes active, and the
      // import screen yields so its placeholder shows. Without this, importing
      // into a fresh library landed back on the Empty State ("nothing stored
      // yet") while entries existed, implying the import was lost.
      const lastSavedId = result.savedIds[result.savedIds.length - 1];
      if (lastSavedId !== undefined) {
        setActiveId(lastSavedId);
        setIsImporting(false);
      }
      // Duplicates-only and failure-only batches deliberately change nothing else:
      // there is no new record to activate, so the prior selection survives and
      // only the summary (or error) speaks for the batch.

      refreshQuota();
    },
    [refreshQuota],
  );

  const dismissImportSummary = useCallback((): void => {
    setImportSummary(undefined);
  }, []);

  const requestClearAll = useCallback((): void => {
    // Recording the request is all that happens here; nothing is removed until
    // `confirmClearAll` runs — one dialog for the whole batch, never per item
    // (FR6/FR7 pattern, ADR #14).
    setIsClearAllPending(true);
  }, []);

  const cancelClearAll = useCallback((): void => {
    setIsClearAllPending(false);
  }, []);

  const confirmClearAll = useCallback((): void => {
    setIsClearAllPending(false);

    void clearLibrary().then((result) => {
      if (!result.ok) {
        logStorageDetail('clear-library', result.error);
        setErrorMessage(toStorageMessage(result.error));
        return;
      }

      // Nothing else to do on success: the live subscription empties `entries`,
      // and with `entries.length === 0` the shell renders the genuine Empty State
      // before any selection branch (ADR #12). `activeId` is left alone on
      // purpose, exactly as for an out-of-band deletion of every record.
    });
  }, []);

  const dismissError = useCallback((): void => {
    setErrorMessage(undefined);
  }, []);

  return {
    entries,
    activeId,
    isImporting,
    importPlatform,
    isLoading,
    errorMessage,
    isStorageNearLimit,
    pendingDelete,
    importSummary,
    isClearAllPending,
    selectConversation,
    openImport,
    closeImport,
    requestDelete,
    confirmDelete,
    cancelDelete,
    addConversations,
    dismissImportSummary,
    requestClearAll,
    confirmClearAll,
    cancelClearAll,
    dismissError,
  };
}

/** Re-exported so tests can assert on outcomes without importing `storage/`. */
export type { SaveOutcome };

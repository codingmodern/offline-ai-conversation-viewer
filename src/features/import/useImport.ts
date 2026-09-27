import { useCallback, useRef, useState } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import type { UserMessage } from '@/i18n/messages';
import { isJsonFile, isLargeFile } from '@/features/import/fileTypeGuard';
import { importFile, type ImportedFile } from '@/features/import/importFile';
import { logTechnicalDetail, toUserMessage } from '@/features/import/errorMessages';

/**
 * Per-file lifecycle shown in the UI (`01-import-validation.md` FR7/FR8).
 *
 * Neither detection nor parsing has a status of its own: to the user they are an
 * invisible part of the same import step (`02-platform-detection.md` and
 * `03-modular-parsing-system.md` → UI Behavior), so the `validating` state spans
 * validation, detection, parsing and normalization.
 */
export type ImportItemStatus = 'validating' | 'success' | 'error';

export interface ImportItem {
  readonly id: string;
  readonly fileName: string;
  readonly size: number;
  readonly status: ImportItemStatus;
  /**
   * Translatable descriptor, rendered by the list at display time. Present only
   * when `status === 'error'`. A descriptor (not finished text) keeps the row
   * correct when the UI language is switched while it is on screen (Unit 12).
   */
  readonly message?: UserMessage;
}

/** A file held back until the user confirms it is worth parsing (>50MB). */
export interface PendingLargeFile {
  readonly id: string;
  readonly file: File;
}

export interface UseImportOptions {
  /**
   * Called with the normalized conversations of each file that imports
   * successfully (Unit 04 FR1 → hand-off to the library).
   *
   * A callback rather than a direct `storage/` call keeps this hook free of any
   * persistence knowledge: Units 01–03 still work unchanged when it is omitted,
   * and the import pipeline stays testable without a database.
   */
  readonly onFileImported?: (conversations: readonly UnifiedConversation[]) => void;
}

export interface UseImportResult {
  readonly items: readonly ImportItem[];
  readonly pendingLargeFiles: readonly PendingLargeFile[];
  readonly importedFiles: readonly ImportedFile[];
  readonly isBusy: boolean;
  readonly addFiles: (files: readonly File[]) => void;
  readonly confirmLargeFile: (id: string) => void;
  readonly cancelLargeFile: (id: string) => void;
  readonly reset: () => void;
}

/**
 * Owns all import state. Kept out of the components so the pipeline can be
 * tested without rendering, and so the next unit can consume `importedFiles`
 * (normalized conversations) without touching the UI.
 */
export function useImport(options: UseImportOptions = {}): UseImportResult {
  const { onFileImported } = options;
  const [items, setItems] = useState<readonly ImportItem[]>([]);
  const [pendingLargeFiles, setPendingLargeFiles] = useState<readonly PendingLargeFile[]>([]);
  const [importedFiles, setImportedFiles] = useState<readonly ImportedFile[]>([]);
  // A counter (not Date.now()) guarantees unique ids even within one tick.
  const nextId = useRef(0);

  const createId = useCallback((): string => {
    nextId.current += 1;
    return `import-${String(nextId.current)}`;
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<ImportItem>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const runImport = useCallback(
    async (id: string, file: File): Promise<void> => {
      const result = await importFile(file, id);

      if (result.ok) {
        setImportedFiles((current) => [...current, result.data]);
        updateItem(id, { status: 'success' });
        // Handed off after the row is marked successful, so a storage failure is
        // reported separately from the parse result the user already saw.
        onFileImported?.(result.data.conversations);
        return;
      }

      // Covers unsupported formats and structural parse failures too: such a file
      // is just another failed row, and the technical reason stays console-only.
      logTechnicalDetail(file.name, result.error);
      updateItem(id, { status: 'error', message: toUserMessage(result.error) });
    },
    [onFileImported, updateItem],
  );

  const startFile = useCallback(
    (file: File): void => {
      const id = createId();
      setItems((current) => [
        ...current,
        { id, fileName: file.name, size: file.size, status: 'validating' },
      ]);
      // Fire and forget: each file settles independently (NFR4), so one slow or
      // failing file never blocks the others.
      void runImport(id, file);
    },
    [createId, runImport],
  );

  const addFiles = useCallback(
    (files: readonly File[]): void => {
      for (const file of files) {
        // Large *valid-looking* files ask for confirmation first; a large file
        // that is not JSON is rejected immediately so no pointless prompt appears.
        if (isLargeFile(file) && isJsonFile(file)) {
          setPendingLargeFiles((current) => [...current, { id: createId(), file }]);
          continue;
        }
        startFile(file);
      }
    },
    [createId, startFile],
  );

  const takePending = useCallback((id: string): File | undefined => {
    let taken: File | undefined;
    setPendingLargeFiles((current) => {
      taken = current.find((pending) => pending.id === id)?.file;
      return current.filter((pending) => pending.id !== id);
    });
    return taken;
  }, []);

  const confirmLargeFile = useCallback(
    (id: string): void => {
      const file = pendingLargeFiles.find((pending) => pending.id === id)?.file;
      takePending(id);
      if (file) {
        startFile(file);
      }
    },
    [pendingLargeFiles, startFile, takePending],
  );

  const cancelLargeFile = useCallback(
    (id: string): void => {
      takePending(id);
    },
    [takePending],
  );

  const reset = useCallback((): void => {
    setItems([]);
    setPendingLargeFiles([]);
    setImportedFiles([]);
  }, []);

  return {
    items,
    pendingLargeFiles,
    importedFiles,
    isBusy: items.some((item) => item.status === 'validating'),
    addFiles,
    confirmLargeFile,
    cancelLargeFile,
    reset,
  };
}

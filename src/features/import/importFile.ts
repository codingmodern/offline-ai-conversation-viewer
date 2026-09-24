import { parseFailure, type ParseResult } from '@/types/errors';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';
import { isJsonFile } from '@/features/import/fileTypeGuard';
import { processFileInWorker } from '@/features/import/workerClient';

/**
 * A fully imported file: validated (Unit 01), attributed to exactly one platform
 * (Unit 02), and parsed into the unified model (Unit 03).
 *
 * This is the hand-off object for the next units (storage / viewer). Nothing is
 * persisted at this point.
 */
export interface ImportedFile {
  readonly fileName: string;
  /** The platform that claimed this file. Chosen automatically — never by the user. */
  readonly providerId: ProviderId;
  /** Provider-independent conversations, ready to display or store. */
  readonly conversations: readonly UnifiedConversation[];
}

/**
 * Full import pipeline for a single file: type gate → worker (read/parse →
 * detect → parse → normalize) → result.
 *
 * The non-JSON check happens before the worker is spawned so an obviously
 * unsupported file costs nothing (`01-import-validation.md` → Edge Cases).
 */
export async function importFile(
  file: File,
  requestId: string,
): Promise<ParseResult<ImportedFile>> {
  if (!isJsonFile(file)) {
    return parseFailure(
      'UnsupportedFileTypeError',
      `Rejected "${file.name}" (type: "${file.type}").`,
    );
  }

  const result = await processFileInWorker(file, requestId);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      fileName: file.name,
      providerId: result.data.providerId,
      conversations: result.data.conversations,
    },
  };
}

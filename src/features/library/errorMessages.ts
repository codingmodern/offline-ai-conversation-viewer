import type { StorageError, StorageErrorCode } from '@/types/storage';
import { userMessage, type UserMessage } from '@/i18n/messages';

/**
 * Storage error translation (`code-standards.md` §5), mirroring
 * `features/import/errorMessages.ts` so both layers behave identically.
 *
 * Components render **only** these messages; `error.detail` (exception text,
 * Dexie internals) goes to the console and never to the screen.
 *
 * Keys rather than finished copy, for the same reason as the import layer: a
 * storage error can be on screen when the language is switched (Unit 12 —
 * `locales/{lng}/common.json` → `errors.*`).
 */
const USER_MESSAGE_KEYS: Record<StorageErrorCode, string> = {
  // The only failure with a concrete remedy the user can act on, so it names it
  // (`architecture.md` §7 → Storage Quota).
  StorageQuotaError: 'errors.StorageQuotaError',
  // Reassurance matters here: FR2 guarantees a failed save changed nothing, so the
  // library the user can still see is intact.
  StorageWriteError: 'errors.StorageWriteError',
  StorageReadError: 'errors.StorageReadError',
  StorageDeleteError: 'errors.StorageDeleteError',
  // Reuses the import layer's wording for a broken export: from the user's point of
  // view the cause is the same file problem, not a storage problem.
  InvalidConversationError: 'errors.InvalidConversationError',
};

/** Maps a technical storage error to a friendly, actionable message descriptor. */
export function toStorageMessage(error: StorageError): UserMessage {
  return userMessage(USER_MESSAGE_KEYS[error.code]);
}

/** Logs full technical detail for debugging. Console-only (`code-standards.md` §5). */
export function logStorageDetail(operation: string, error: StorageError): void {
  if (error.detail !== undefined) {
    console.error(`[storage] ${operation} → ${error.code}: ${error.detail}`);
  } else {
    console.error(`[storage] ${operation} → ${error.code}`);
  }
}

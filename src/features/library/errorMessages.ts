import type { StorageError, StorageErrorCode } from '@/types/storage';

/**
 * Storage error translation (`code-standards.md` §5), mirroring
 * `features/import/errorMessages.ts` so both layers behave identically.
 *
 * Components render **only** these strings; `error.detail` (exception text, Dexie
 * internals) goes to the console and never to the screen.
 */
const USER_MESSAGES: Record<StorageErrorCode, string> = {
  // The only failure with a concrete remedy the user can act on, so it names it
  // (`architecture.md` §7 → Storage Quota).
  StorageQuotaError:
    'فضای ذخیره‌سازی مرورگر پر شده است. برای افزودن گفتگوی جدید، چند گفتگوی قدیمی را حذف کنید.',
  // Reassurance matters here: FR2 guarantees a failed save changed nothing, so the
  // library the user can still see is intact.
  StorageWriteError: 'ذخیره‌ی این گفتگو ممکن نشد. کتابخانه‌ی شما بدون تغییر باقی مانده است.',
  StorageReadError: 'خواندن کتابخانه‌ی گفتگوها ممکن نشد. لطفاً صفحه را دوباره باز کنید.',
  StorageDeleteError: 'حذف این گفتگو ممکن نشد. لطفاً دوباره تلاش کنید.',
  // Reuses the import layer's wording for a broken export: from the user's point of
  // view the cause is the same file problem, not a storage problem.
  InvalidConversationError: 'ساختار این گفتگو کامل نیست و ذخیره‌ی آن ممکن نشد.',
};

/** Maps a technical storage error to a friendly, actionable Persian message. */
export function toStorageMessage(error: StorageError): string {
  return USER_MESSAGES[error.code];
}

/** Logs full technical detail for debugging. Console-only (`code-standards.md` §5). */
export function logStorageDetail(operation: string, error: StorageError): void {
  if (error.detail !== undefined) {
    console.error(`[storage] ${operation} → ${error.code}: ${error.detail}`);
  } else {
    console.error(`[storage] ${operation} → ${error.code}`);
  }
}

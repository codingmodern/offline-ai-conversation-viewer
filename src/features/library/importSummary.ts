import { userMessage, type UserMessage } from '@/i18n/messages';

/**
 * Copy for ONE post-import batch summary (ADR #13).
 *
 * Shown once per batch that contained at least one skipped duplicate; a clean
 * batch stays silent because activating its last conversation (ADR #12) already
 * confirms the import worked.
 *
 * Returns a descriptor rather than a finished string (Unit 12): the banner can
 * outlive a language switch, so the two counts travel as parameters and the text
 * is produced at render time. Latin digits are kept in both locales — the
 * reasoning recorded for the Persian copy applies to the shell as a whole (the
 * same convention as the Sidebar's message counts), and Persian needs no plural
 * agreement here, so «۳ گفتگو اضافه شد» is correct for every count.
 */
export function formatImportSummary(savedCount: number, skippedCount: number): UserMessage {
  return userMessage('summary.importSummary', { saved: savedCount, skipped: skippedCount });
}

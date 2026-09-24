/**
 * Persian copy for ONE post-import batch summary (ADR #13).
 *
 * Shown once per batch that contained at least one skipped duplicate; a clean
 * batch stays silent because activating its last conversation (ADR #12) already
 * confirms the import worked. Latin digits match the rest of the shell (e.g. the
 * message counts in Sidebar rows), and Persian needs no plural agreement here —
 * «۳ گفتگو اضافه شد» is correct for every count.
 */
export function formatImportSummary(savedCount: number, skippedCount: number): string {
  return `${savedCount} گفتگو اضافه شد، ${skippedCount} گفتگوی تکراری نادیده گرفته شد.`;
}

/**
 * Pre-read gate: only JSON files enter the pipeline
 * (`01-import-validation.md` FR4 + Validation → "پسوند/نوع فایل").
 */

/** MIME types browsers report for `.json` files. */
const JSON_MIME_TYPES: readonly string[] = ['application/json', 'text/json'];

/** Above this size the user is warned before parsing starts (not rejected). */
export const LARGE_FILE_WARNING_BYTES = 50 * 1024 * 1024;

/**
 * True when the file looks like JSON.
 *
 * Extension is checked first because it is the most reliable signal: some
 * platforms report an empty or generic MIME type (e.g. `application/octet-stream`)
 * for `.json`, which would wrongly reject a valid export.
 */
export function isJsonFile(file: File): boolean {
  const hasJsonExtension = file.name.toLowerCase().endsWith('.json');
  return hasJsonExtension || JSON_MIME_TYPES.includes(file.type.toLowerCase());
}

/** True when the file is large enough to warrant an explicit user confirmation. */
export function isLargeFile(file: File): boolean {
  return file.size > LARGE_FILE_WARNING_BYTES;
}

/** Formats a byte count for display (e.g. `12.4 MB`). Uses Persian-friendly digits-as-is. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex] ?? 'KB'}`;
}

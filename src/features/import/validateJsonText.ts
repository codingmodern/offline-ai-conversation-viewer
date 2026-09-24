import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';

/**
 * Validates raw file text as JSON.
 *
 * Scope boundary (`01-import-validation.md` FR6): this checks **syntax and
 * non-emptiness only**. It deliberately performs no provider/shape detection —
 * that belongs exclusively to Unit 02.
 *
 * Kept as a pure function (no `File`, no `Worker`, no DOM) so the validation
 * rules are unit-testable without a worker environment.
 */
export function validateJsonText(text: string): ParseResult<unknown> {
  // A zero-byte or whitespace-only file would make JSON.parse throw a syntax
  // error, but "empty" is the more accurate and more actionable message.
  if (text.trim().length === 0) {
    return parseFailure('EmptyContentError', 'File contains no characters.');
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    return parseFailure(
      'MalformedJsonError',
      cause instanceof Error ? cause.message : String(cause),
    );
  }

  if (isSemanticallyEmpty(data)) {
    return parseFailure('EmptyContentError', 'Parsed JSON has no usable content.');
  }

  return parseSuccess(data);
}

/**
 * `null`, `{}` and `[]` parse successfully but carry no conversation data, so
 * they are rejected here rather than being passed to Unit 02
 * (`01-import-validation.md` → Validation → "ساختار غیر-خالی").
 */
function isSemanticallyEmpty(data: unknown): boolean {
  if (data === null) {
    return true;
  }
  if (Array.isArray(data)) {
    return data.length === 0;
  }
  if (typeof data === 'object') {
    return Object.keys(data).length === 0;
  }
  // Primitives (numbers, strings, booleans) are not empty. They are almost
  // certainly not a valid export either, but that verdict is Unit 02's job.
  return false;
}

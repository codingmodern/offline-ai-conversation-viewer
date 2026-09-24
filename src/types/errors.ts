/**
 * Shared error model for the import/parse pipeline.
 *
 * Why a discriminated union instead of thrown exceptions: `code-standards.md` §2
 * requires predictable, typed results (`{ ok: true } | { ok: false }`) so that no
 * untyped error can ever reach the UI layer, and §5 requires that every technical
 * error be translated by a mapper before display.
 *
 * Codes are added per unit as needed — per the "small, verifiable increments"
 * rule in `00-build-plan.md`. Unit 01 (Import & Validation), Unit 02 (Platform
 * Auto-Detection) and Unit 03 (Modular Parsing) codes exist here; Storage adds
 * its own later.
 *
 * `MissingFieldError` / `UnexpectedTypeError` are the two `ParseError` subtypes
 * required by Unit 03: they are distinguished because "the export omits this
 * field" and "the export changed this field's type" point at different causes
 * when diagnosing a rejected file.
 */

/** Categories of failure the import + detection pipeline can produce. */
export type ParseErrorCode =
  /** File rejected before reading: wrong extension / MIME type. */
  | 'UnsupportedFileTypeError'
  /** The browser could not read the file from disk (permissions, disappeared, I/O). */
  | 'FileReadError'
  /** File content is not syntactically valid JSON. */
  | 'MalformedJsonError'
  /** Valid JSON, but semantically empty (`{}`, `[]`, `null`, blank text). */
  | 'EmptyContentError'
  /** Unit 02: no registered provider recognised the structure. */
  | 'UnsupportedFormatError'
  /**
   * Unit 03: a field required to build a conversation is absent
   * (`03-modular-parsing-system.md` FR6 — typed, never an untyped throw).
   */
  | 'MissingFieldError'
  /** Unit 03: a required field exists but holds the wrong JSON type. */
  | 'UnexpectedTypeError'
  /**
   * Unit 02: more than one provider claimed the file. Reported instead of
   * silently picking the first match (`02-platform-detection.md` FR7).
   */
  | 'AmbiguousFormatError'
  /** Any unforeseen failure (e.g. worker crash, out of memory on a huge file). */
  | 'UnexpectedImportError';

/**
 * A typed, serializable error. Must stay structured-clone friendly because it
 * crosses the Web Worker boundary via `postMessage`.
 */
export interface ParseError {
  readonly code: ParseErrorCode;
  /**
   * Technical detail for `console` debugging only. Never rendered to the user
   * (`code-standards.md` §5). Optional because some failures carry no extra detail.
   */
  readonly detail?: string;
}

/** Discriminated result type shared by every step of the import pipeline. */
export type ParseResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ParseError };

/** Builds a failed `ParseResult`, keeping call sites free of object boilerplate. */
export function parseFailure<T>(code: ParseErrorCode, detail?: string): ParseResult<T> {
  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
  // property, so `detail` is only included when it actually has a value.
  return { ok: false, error: detail === undefined ? { code } : { code, detail } };
}

/** Builds a successful `ParseResult`. */
export function parseSuccess<T>(data: T): ParseResult<T> {
  return { ok: true, data };
}

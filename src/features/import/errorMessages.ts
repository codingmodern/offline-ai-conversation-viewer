import type { ParseError, ParseErrorCode } from '@/types/errors';
import { userMessage, type UserMessage } from '@/i18n/messages';

/**
 * Error translation layer (`code-standards.md` §5), Unit 12 aware.
 *
 * Components render **only** these messages. Raw `error.detail` (exception text,
 * stack traces) is never shown to the user; it is logged to the console instead.
 *
 * The map holds translation *keys* rather than finished copy: an error row can
 * stay on screen while the user switches languages, and a pre-rendered string
 * would then be the only Persian text left in an English UI (spec AC4). The
 * wording itself now lives in `locales/{lng}/common.json` under `errors.*`.
 */
const USER_MESSAGE_KEYS: Record<ParseErrorCode, string> = {
  UnsupportedFileTypeError: 'errors.UnsupportedFileTypeError',
  FileReadError: 'errors.FileReadError',
  MalformedJsonError: 'errors.MalformedJsonError',
  EmptyContentError: 'errors.EmptyContentError',
  // Wording approved in `02-platform-detection.md` → UI Behavior.
  UnsupportedFormatError: 'errors.UnsupportedFormatError',
  // Deliberately generic: which parsers matched is internal diagnostic detail.
  AmbiguousFormatError: 'errors.AmbiguousFormatError',
  // Both parsing failures share one actionable fact ("this export cannot be
  // read"). Which field was missing or mistyped is diagnostic detail and stays
  // in the console (`code-standards.md` §5).
  MissingFieldError: 'errors.MissingFieldError',
  UnexpectedTypeError: 'errors.UnexpectedTypeError',
  UnexpectedImportError: 'errors.UnexpectedImportError',
};

/** Maps a technical error to a friendly, actionable message descriptor. */
export function toUserMessage(error: ParseError): UserMessage {
  return userMessage(USER_MESSAGE_KEYS[error.code]);
}

/**
 * Logs full technical detail for debugging. Console-only: without a backend
 * there is no external logging service (`code-standards.md` §5).
 */
export function logTechnicalDetail(fileName: string, error: ParseError): void {
  if (error.detail !== undefined) {
    console.error(`[import] ${fileName} → ${error.code}: ${error.detail}`);
  } else {
    console.error(`[import] ${fileName} → ${error.code}`);
  }
}

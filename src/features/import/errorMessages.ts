import type { ParseError, ParseErrorCode } from '@/types/errors';

/**
 * Error translation layer (`code-standards.md` §5).
 *
 * Components render **only** these strings. Raw `error.detail` (exception text,
 * stack traces) is never shown to the user; it is logged to the console instead.
 */
const USER_MESSAGES: Record<ParseErrorCode, string> = {
  UnsupportedFileTypeError: 'فقط فایل JSON پشتیبانی می‌شود.',
  FileReadError: 'خواندن این فایل ممکن نشد. لطفاً دوباره تلاش کنید.',
  MalformedJsonError: 'این فایل قابل خواندن نیست. لطفاً از خروجی رسمی پلتفرم استفاده کنید.',
  EmptyContentError: 'این فایل خالی است و محتوایی برای نمایش ندارد.',
  // Wording approved in `02-platform-detection.md` → UI Behavior.
  UnsupportedFormatError:
    'این فایل به هیچ‌کدام از پلتفرم‌های پشتیبانی‌شده (ChatGPT، Claude، Gemini، DeepSeek) تعلق ندارد.',
  // Deliberately generic: which parsers matched is internal diagnostic detail.
  AmbiguousFormatError: 'فرمت فایل قابل تشخیص قطعی نیست.',
  // Both parsing failures share one actionable fact ("this export cannot be
  // read"). Which field was missing or mistyped is diagnostic detail and stays
  // in the console (`code-standards.md` §5).
  MissingFieldError: 'ساختار این فایل کامل نیست و خواندن گفتگوها ممکن نشد.',
  UnexpectedTypeError: 'ساختار این فایل با آنچه انتظار می‌رفت مطابقت ندارد.',
  UnexpectedImportError:
    'پردازش این فایل با مشکل مواجه شد. اگر فایل بسیار بزرگ است، دوباره تلاش کنید.',
};

/** Maps a technical error to a friendly, actionable Persian message. */
export function toUserMessage(error: ParseError): string {
  return USER_MESSAGES[error.code];
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

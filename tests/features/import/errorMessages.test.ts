import { describe, expect, it, vi } from 'vitest';
import { logTechnicalDetail, toUserMessage } from '@/features/import/errorMessages';
import type { ParseError, ParseErrorCode } from '@/types/errors';

const ALL_CODES: readonly ParseErrorCode[] = [
  'UnsupportedFileTypeError',
  'FileReadError',
  'MalformedJsonError',
  'EmptyContentError',
  'UnsupportedFormatError',
  'AmbiguousFormatError',
  'UnexpectedImportError',
];

describe('toUserMessage', () => {
  it.each(ALL_CODES)('returns a non-empty Persian message for %s', (code) => {
    const error: ParseError = { code };

    const message = toUserMessage(error);

    expect(message.length).toBeGreaterThan(0);
    // Guards the rule that raw technical wording never reaches the user.
    expect(message).not.toMatch(/Error|JSON\.parse|undefined/);
  });

  it('never leaks the technical detail into the user message', () => {
    const error: ParseError = {
      code: 'MalformedJsonError',
      detail: 'Unexpected token } in JSON at position 42',
    };

    expect(toUserMessage(error)).not.toContain('position 42');
  });

  it('keeps the ambiguous-format message generic (no parser names)', () => {
    const error: ParseError = {
      code: 'AmbiguousFormatError',
      detail: 'Multiple providers matched: deepseek, chatgpt.',
    };

    const message = toUserMessage(error);

    // `02-platform-detection.md`: which parsers matched is console-only detail.
    expect(message).not.toMatch(/deepseek|chatgpt/i);
  });
});

describe('logTechnicalDetail', () => {
  it('logs the code and detail to the console for debugging', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error: ParseError = { code: 'MalformedJsonError', detail: 'boom' };

    logTechnicalDetail('chat.json', error);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('MalformedJsonError'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('logs a code-only message when no detail is present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logTechnicalDetail('chat.json', { code: 'FileReadError' });

    expect(spy).toHaveBeenCalledWith('[import] chat.json → FileReadError');
  });
});

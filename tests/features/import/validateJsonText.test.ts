import { describe, expect, it } from 'vitest';
import { validateJsonText } from '@/features/import/validateJsonText';

describe('validateJsonText', () => {
  it('accepts a well-formed JSON object', () => {
    const result = validateJsonText('{"title":"سلام","messages":[{"role":"user"}]}');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ title: 'سلام', messages: [{ role: 'user' }] });
    }
  });

  it('accepts a non-empty JSON array', () => {
    const result = validateJsonText('[{"id":1}]');

    expect(result.ok).toBe(true);
  });

  it.each([
    ['truncated object', '{"title":'],
    ['trailing comma', '{"a":1,}'],
    ['plain text', 'not json at all'],
    ['single quotes', "{'a':1}"],
  ])('rejects malformed JSON (%s)', (_label, text) => {
    const result = validateJsonText(text);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MalformedJsonError');
    }
  });

  it.each([
    ['zero-byte file', ''],
    ['whitespace only', '   \n\t  '],
  ])('rejects an empty file (%s)', (_label, text) => {
    const result = validateJsonText(text);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EmptyContentError');
    }
  });

  it.each([
    ['null', 'null'],
    ['empty object', '{}'],
    ['empty array', '[]'],
  ])('rejects syntactically valid but content-free JSON (%s)', (_label, text) => {
    const result = validateJsonText(text);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EmptyContentError');
    }
  });

  it('does not attempt provider detection (Unit 02 boundary)', () => {
    // An object with no provider-specific shape must still pass Unit 01.
    const result = validateJsonText('{"totally":"unknown shape"}');

    expect(result.ok).toBe(true);
  });
});

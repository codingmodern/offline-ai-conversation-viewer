import { describe, expect, it } from 'vitest';
import { splitCodeFences } from '@/themes/deepseek/codeFences';

/**
 * Unit 06 FR6: fenced code inside a verbatim message body must be detectable so
 * it can render as DeepSeek's code block — without turning the splitter into a
 * Markdown parser and without altering any non-code byte.
 */

describe('splitCodeFences', () => {
  it('returns a single verbatim text segment when there are no fences', () => {
    expect(splitCodeFences('just text\nsecond line')).toEqual([
      { type: 'text', value: 'just text\nsecond line' },
    ]);
  });

  it('returns an empty list for empty content', () => {
    expect(splitCodeFences('')).toEqual([]);
  });

  it('splits mixed content into ordered text/code/text segments', () => {
    const segments = splitCodeFences('قبل\n```python\nprint(1)\nprint(2)\n```\nبعد');

    expect(segments).toEqual([
      { type: 'text', value: 'قبل' },
      { type: 'code', value: 'print(1)\nprint(2)', language: 'python' },
      { type: 'text', value: 'بعد' },
    ]);
  });

  it('omits the language property when the fence carries no info string', () => {
    const [segment] = splitCodeFences('```\nbare\n```');

    // exactOptionalPropertyTypes: absent, never explicitly undefined.
    expect(segment).toEqual({ type: 'code', value: 'bare' });
    expect(segment).not.toHaveProperty('language');
  });

  it('keeps an unclosed fence as code instead of dropping it', () => {
    expect(splitCodeFences('text\n```js\nlet x = 1;')).toEqual([
      { type: 'text', value: 'text' },
      { type: 'code', value: 'let x = 1;', language: 'js' },
    ]);
  });

  it('treats a language-labelled empty fence as a (empty) code block', () => {
    expect(splitCodeFences('```ts\n```')).toEqual([
      { type: 'code', value: '', language: 'ts' },
    ]);
  });

  it('never trims or re-formats text between fences', () => {
    const [only] = splitCodeFences('  spaced  text  ');

    expect(only).toEqual({ type: 'text', value: '  spaced  text  ' });
  });
});

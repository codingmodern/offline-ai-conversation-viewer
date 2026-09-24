import { describe, expect, it } from 'vitest';
import { splitCodeFences } from '@/themes/chatgpt/codeFences';

/**
 * ChatGPT's replies interleave prose and ``` fences; the splitter must detect
 * fences for the theme's code blocks without becoming a Markdown parser and
 * without altering any non-code byte. Same contract as the Claude/DeepSeek
 * splitters — duplicated per theme, tested per theme (11b FR-3).
 */

describe('splitCodeFences (chatgpt)', () => {
  it('returns a single verbatim text segment when there are no fences', () => {
    expect(splitCodeFences('just text\nsecond line')).toEqual([
      { type: 'text', value: 'just text\nsecond line' },
    ]);
  });

  it('splits mixed content into ordered text/code/text segments', () => {
    const segments = splitCodeFences('قبل\n```python\nprint(1)\n```\nبعد');

    expect(segments).toEqual([
      { type: 'text', value: 'قبل' },
      { type: 'code', value: 'print(1)', language: 'python' },
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

  it('returns an empty list for empty content', () => {
    expect(splitCodeFences('')).toEqual([]);
  });
});

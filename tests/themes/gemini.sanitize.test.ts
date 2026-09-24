import { describe, expect, it } from 'vitest';
import { sanitizeMessageHtml, splitCodeBlocks, toPlainText } from '@/themes/gemini/sanitizeHtml';

/**
 * The security boundary of the Gemini theme (NFR2, Invariant #5, ADR #21):
 * `safeHtmlItem[].html` is untrusted third-party markup and may only reach the
 * document after DOMPurify, with the census-derived allow-list of
 * `sanitizeHtml.ts`. These tests pin what must never survive, what must, and
 * the exact shape the renderer consumes.
 */

describe('sanitizeMessageHtml — what must not survive', () => {
  it('strips scripts, their content, and inline event handlers', () => {
    const sanitized = sanitizeMessageHtml(
      '<p>سلام</p><script>alert(1)</script><p onmouseover="alert(2)">دنیا</p>',
    );

    expect(sanitized).toContain('<p>سلام</p>');
    expect(sanitized).toContain('دنیا');
    expect(sanitized).not.toContain('script');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).not.toContain('onmouseover');
  });

  it('strips dangerous URL schemes and non-allowed attributes', () => {
    const sanitized = sanitizeMessageHtml(
      '<a href="javascript:alert(1)" style="position:fixed" class="x">لینک</a>',
    );

    // The anchor text survives; the scheme and the styling hooks do not.
    expect(sanitized).toContain('>لینک</a>');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('style=');
    expect(sanitized).not.toContain('class=');
  });

  it('never lets an image (or any networked element) reach the document', () => {
    // Invariant #1: this app makes no network request. The export carries no
    // binaries either, so an <img> is a remote fetch waiting to happen — the
    // element goes, and with it the last way to trigger a fetch.
    const sanitized = sanitizeMessageHtml(
      '<p>قبل</p><img src="https://evil.example/track.png" alt="ربایي"><p>بعد</p>',
    );

    expect(sanitized).not.toContain('<img');
    expect(sanitized).not.toContain('src=');
    expect(sanitized).toContain('<p>قبل</p>');
    expect(sanitized).toContain('<p>بعد</p>');
  });

  it('keeps foreign-element text while dropping the element itself', () => {
    // An unattested construct degrades to its text — content is never lost.
    const sanitized = sanitizeMessageHtml('<p>متن</p><table><tr><td>سلول</td></tr></table>');

    expect(sanitized).not.toContain('<table');
    expect(sanitized).toContain('سلول');
  });
});

describe('sanitizeMessageHtml — what must survive', () => {
  it('keeps every tag the census attests', () => {
    const sanitized = sanitizeMessageHtml(
      '<h3>عنوان</h3><p>متن <strong>پررنگ</strong> و <em>کج</em> با <code>کد</code>.</p>' +
        '<ul><li>مورد</li></ul><ol><li>شماره</li></ol>' +
        '<blockquote><p>نقل</p></blockquote><hr><pre><code>خط کد</code></pre>' +
        '<a href="https://example.com">پیوند</a>',
    );

    for (const tag of ['h3', 'strong', 'em', 'code', 'ul', 'li', 'ol', 'blockquote', 'hr', 'pre', 'a']) {
      expect(sanitized).toContain(`<${tag}`);
    }
    expect(sanitized).toContain('href="https://example.com"');
  });

  it('forces every surviving anchor through a noopener shell', () => {
    const sanitized = sanitizeMessageHtml('<a href="https://example.com">پیوند</a>');

    expect(sanitized).toContain('target="_blank"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
  });

  it('leaves text that merely looks like markup escaped', () => {
    // The export's *text* may contain angle brackets; they must stay text.
    const sanitized = sanitizeMessageHtml('<p>a &lt;script&gt; b</p>');

    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeMessageHtml('')).toBe('');
  });
});

describe('splitCodeBlocks', () => {
  it('lifts top-level pre blocks out as code segments, keeping document order', () => {
    const segments = splitCodeBlocks(
      sanitizeMessageHtml('<p>قبل</p><pre><code>npm run test\n</code></pre><p>بعد</p>'),
    );

    expect(segments).toEqual([
      { kind: 'html', value: '<p>قبل</p>' },
      { kind: 'code', value: 'npm run test\n' },
      { kind: 'html', value: '<p>بعد</p>' },
    ]);
  });

  it('keeps escaped text escaped when a run is re-serialised', () => {
    // The reason the split moves DOM nodes instead of string slices: text that
    // merely looks like markup must stay escaped on the way back out.
    const segments = splitCodeBlocks(sanitizeMessageHtml('<p>a &lt;script&gt; b</p>'));

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('html');
    expect(segments[0]?.value).toContain('&lt;script&gt;');
    expect(segments[0]?.value).not.toContain('<script>');
  });

  it('decodes entities inside a lifted code block (the code is the text)', () => {
    // The real export's code blocks carry &quot; for quotes inside values.
    const segments = splitCodeBlocks(
      sanitizeMessageHtml('<pre><code>Environment=&quot;HTTP_PROXY&quot;</code></pre>'),
    );

    expect(segments).toEqual([{ kind: 'code', value: 'Environment="HTTP_PROXY"' }]);
  });

  it('leaves a nested pre inside its html run (graceful degradation)', () => {
    const segments = splitCodeBlocks(
      sanitizeMessageHtml('<ul><li><pre><code>تودرتو</code></pre></li></ul>'),
    );

    expect(segments).toEqual([{ kind: 'html', value: expect.stringContaining('<pre>') }]);
  });

  it('returns no segments for empty input', () => {
    expect(splitCodeBlocks('')).toEqual([]);
  });
});

describe('toPlainText', () => {
  it('copies what the user can read: blocks as lines, entities decoded', () => {
    const text = toPlainText(
      sanitizeMessageHtml(
        '<p>خط اول</p><p>خط دوم</p><ul><li>مورد یک</li><li>مورد دو</li></ul>' +
          '<pre><code>key=&quot;value&quot;</code></pre>',
      ),
    );

    expect(text).toBe('خط اول\nخط دوم\nمورد یک\nمورد دو\nkey="value"');
  });

  it('trims the edges so the clipboard holds no leading or trailing blank line', () => {
    const text = toPlainText(sanitizeMessageHtml('<p>فقط همین</p>'));

    expect(text).toBe('فقط همین');
  });
});
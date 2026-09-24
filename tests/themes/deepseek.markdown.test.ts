import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/themes/deepseek/markdown';

/**
 * Markdown pipeline contract (post-Unit-06 refinement, ADR #20).
 *
 * These tests pin three things only: the supported subset, the XSS row of
 * `architecture.md`, and the link-hygiene promise. Anything else is marked's
 * contract, not ours.
 */
describe('renderMarkdown (themes/deepseek/markdown.ts)', () => {
  it('converts headings, emphasis, lists, blockquotes, inline code, and autolinks', () => {
    const html = renderMarkdown(
      '## Title\n\nHello **bold** and *italic* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> a quote\n\nvisit https://example.com',
    );

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('turns a single newline into <br> (marked `breaks` option)', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).toContain('<br');
  });

  it('strips <script>, inline handlers, and dangerous schemes', () => {
    const html = renderMarkdown(
      'hello<script>alert(1)</script><img src=x onerror="alert(1)"> [click](javascript:alert(1))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('forces every link to open in a new tab with rel hardening', () => {
    const html = renderMarkdown('see [docs](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps raw text on a single line when there is no Markdown', () => {
    const html = renderMarkdown('just a sentence');
    expect(html).toContain('just a sentence');
  });
});

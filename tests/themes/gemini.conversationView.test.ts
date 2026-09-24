import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks themes/gemini/GeminiConversationView.module.css message-list
 * containment and the full-bleed backdrop, mirroring the other themes' static
 * locks: the `<ol>` is a column flex so each `<li>` is a flex item, and every
 * item may shrink below its content's intrinsic width (min-width: 0) so a
 * pathological unbroken string wraps (overflow-wrap on the message content
 * already folds it) instead of widening the list past the column. jsdom has no
 * layout engine, so the declarations themselves are pinned here.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/gemini/GeminiConversationView.module.css'),
  'utf8',
);

/** Extracts the body of a top-level `.selector { ... }` declaration. */
function ruleBlock(selector: string): string {
  const start = css.indexOf('.' + selector + ' {');
  if (start === -1) {
    throw new Error('.' + selector + ' rule not found');
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('gemini conversation view list containment', () => {
  it('keeps message rows shrinkable column-flex items', () => {
    const messages = ruleBlock('messages');
    expect(messages).toContain('display: flex');
    expect(messages).toContain('flex-direction: column');
    expect(messages).toContain('gap: var(--gemini-spacing-message-gap)');

    const messageItem = ruleBlock('messageItem');
    expect(messageItem).toContain('margin: 0');
    expect(messageItem).toContain('min-width: 0');
  });

  it('keeps the backdrop full-bleed and the measure on the column', () => {
    const view = ruleBlock('view');
    expect(view).toContain('min-height: 100%');
    expect(view).toContain('background: var(--gemini-bg-base)');
    expect(view).toContain('font-family: var(--gemini-font-sans)');
    expect(view).not.toContain('max-width');

    const column = ruleBlock('column');
    expect(column).toContain('max-width: 48rem');
    expect(column).toContain('margin: 0 auto');
    expect(column).toContain('padding: var(--gemini-spacing-container-padding)');
  });

  it('keeps the empty state quiet and centred', () => {
    const empty = ruleBlock('empty');
    expect(empty).toContain('text-align: center');
    expect(empty).toContain('color: var(--gemini-text-muted)');
  });
});
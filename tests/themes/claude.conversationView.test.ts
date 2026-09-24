import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks themes/claude/ClaudeConversationView.module.css message list
 * containment (Session 14 hardening): the <ol> is a column flex so each <li>
 * is a flex item, and every item may shrink below its content's intrinsic
 * width (min-width: 0) so a pathological unbroken string wraps (overflow-wrap
 * on the message content already folds it) instead of widening the list past
 * the column. jsdom has no layout engine, so the declarations themselves are
 * pinned here, mirroring the other theme static locks.
 * Session 15: .view stays the full-bleed backdrop (no max-width) and
 * .column carries the readable measure.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/claude/ClaudeConversationView.module.css'),
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

describe('claude conversation view list containment', () => {
  it('keeps message rows shrinkable column-flex items', () => {
    const messages = ruleBlock('messages');
    expect(messages).toContain('display: flex');
    expect(messages).toContain('flex-direction: column');

    const messageItem = ruleBlock('messageItem');
    expect(messageItem).toContain('margin: 0');
    expect(messageItem).toContain('min-width: 0');
  });

  it('keeps the backdrop full-bleed and the measure on the column', () => {
    const view = ruleBlock('view');
    expect(view).toContain('min-height: 100%');
    expect(view).toContain('background: var(--claude-bg-base)');
    expect(view).not.toContain('max-width');

    const column = ruleBlock('column');
    expect(column).toContain('max-width: 48rem');
    expect(column).toContain('margin: 0 auto');
    expect(column).toContain('padding: var(--claude-spacing-container-padding)');
  });
});

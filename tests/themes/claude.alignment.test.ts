import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks the RTL row anchoring of themes/claude/ClaudeMessage.module.css
 * (09b row 1: the user bubble flush to the physical right, ui-context.md
 * section 4.4). In this RTL-locked app (index.html dir="rtl") the flex
 * inline start is the physical right edge, and the Persian text inside
 * keeps its natural RTL flow: the block's horizontal anchor moves, never
 * the text alignment. The assistant row is a plain full-width column
 * stack: its old 09b row-2 flush-left anchor (`align-items: flex-end`)
 * was removed after manual DevTools testing, and the removal is locked
 * here permanently. Also pins the user-bubble overflow hardening
 * (`min-width: 0` + `overflow-wrap: anywhere`). jsdom has no layout
 * engine, so the physical placement is asserted at the level the CSS
 * module actually encodes - the declaration blocks themselves; the
 * rendered class wiring is pinned in
 * tests/components/ClaudeMessage.test.tsx.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/claude/ClaudeMessage.module.css'),
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

describe('claude message row anchoring (RTL-locked app, 09b row 1)', () => {
  it('anchors the user bubble to the physical right (flex-start = inline start in RTL)', () => {
    const block = ruleBlock('userRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('justify-content: flex-start');
    // Session 18: the RTL geometry is pinned explicitly on THIS row only
    // (user-tested) - the inline start stays the physical right edge even
    // if an ancestor dir ever changes.
    expect(block).toContain('direction: rtl');
  });

  it('keeps assistantRow a plain column stack - the physical-left anchor stays gone', () => {
    const block = ruleBlock('assistantRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('flex-direction: column');
    // The user-tested removal is permanent: no cross-axis anchor at all.
    // With the default stretch the body and the action row span the full
    // column width, so the Copy/date row sits at the inline start (the
    // physical RIGHT in dir="rtl") instead of hugging the inline end -
    // and a row-direction justify-content would lay the body and its
    // action row out side by side, so neither axis anchor may return.
    // The explicit `direction: rtl` pin lives on `.userRow` only.
    expect(block).not.toContain('align-items');
    expect(block).not.toContain('justify-content');
    expect(block).not.toContain('direction: rtl');
  });

  it('keeps the Persian text alignment natural across all row rules', () => {
    for (const selector of ['row', 'userRow', 'assistantRow', 'assistantBody', 'assistantText']) {
      expect(ruleBlock(selector)).not.toContain('text-align');
    }
  });

  it('keeps the user bubble wrapping unbroken strings with a shrinkable flex item', () => {
    expect(ruleBlock('userMessage')).toContain('min-width: 0');
    expect(ruleBlock('userMessage')).toContain('max-width: 70%');
    const bubble = ruleBlock('userBubble');
    expect(bubble).toContain('white-space: pre-wrap');
    expect(bubble).toContain('overflow-wrap: anywhere');
  });

  it('keeps the only text-align left override on the LTR code fallback, never on message text', () => {
    expect(css.split('text-align: left').length - 1).toBe(1);
    // The single exception is the `direction: ltr` line box of the marked
    // pre fallback for LTR code (ImportFileList precedent).
    const pre = ruleBlock('assistantText pre');
    expect(pre).toContain('direction: ltr');
    expect(pre).toContain('text-align: left');
  });
});

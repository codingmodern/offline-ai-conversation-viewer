import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks the RTL row anchoring of themes/gemini/GeminiMessage.module.css
 * (`ui-context.md` §4.5: the user bubble on the physical right, the answer as
 * the page itself). The Gemini theme implements the row geometry the two older
 * themes were user-tested into (Sessions 17/18): the user row pins
 * `direction: rtl` explicitly and anchors at the inline start; the assistant
 * row is a bare column stack with no cross-axis anchor, so the draft chip, Copy
 * and date sit under the answer's inline-start edge. jsdom has no layout
 * engine, so the physical placement is asserted at the level the CSS module
 * actually encodes — the declaration blocks themselves; the rendered class
 * wiring is pinned in tests/components/GeminiMessage.test.tsx.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/gemini/GeminiMessage.module.css'),
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

describe('gemini message row anchoring (RTL-locked app)', () => {
  it('anchors the user bubble to the physical right (flex-start = inline start in RTL)', () => {
    const block = ruleBlock('userRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('justify-content: flex-start');
    // Session 18's user-tested pin, applied here from the start: the row keeps
    // its RTL geometry even if an ancestor dir ever changes.
    expect(block).toContain('direction: rtl');
  });

  it('keeps assistantRow a bare column stack — no cross-axis or direction anchor', () => {
    const block = ruleBlock('assistantRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('flex-direction: column');
    // Children stretch full width, so the answer text starts at the inline
    // start (physical RIGHT in dir="rtl") and `.actions` packs under that same
    // edge. A row-direction justify-content would lay the body and its action
    // row out side by side, so neither axis anchor may be added. (The substring
    // check is `direction: rtl`, not bare `direction`: the rule's own
    // `flex-direction` would false-positive.)
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

  it('keeps every text-align: left override on an LTR code surface, never on message text', () => {
    // Two code surfaces exist in this theme: the lifted code block and the
    // nested `pre` fallback that stays inside its HTML run. Both are LTR line
    // boxes (the ImportFileList precedent); nothing else may override the
    // natural bidi alignment of message text.
    const leftAligned = css.split('text-align: left').length - 1;
    expect(leftAligned).toBe(2);
    expect(ruleBlock('codePre')).toContain('direction: ltr');
    expect(ruleBlock('assistantText pre')).toContain('direction: ltr');
  });

  it('sizes the assistant answer from tokens, with no bubble background', () => {
    const body = ruleBlock('assistantBody');
    expect(body).toContain('color: var(--gemini-bubble-assistant-text)');
    expect(css.match(/\.assistantBody\s*{[^}]*background/s)).toBeNull();
  });
});
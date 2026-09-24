import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks the RTL row anchoring of themes/chatgpt/ChatGPTMessage.module.css
 * (11b §4.3) plus the two behaviours the ChatGPT spec adds on top of Claude's:
 * the hover/focus reveal of the message action row (§4.3 Message Actions,
 * with the touch-only `hover: none` fallback) and the absence of any model
 * avatar rule (11b doc gap #4 — the avatar rows were removed from §4.3).
 * jsdom has no layout engine, so the physical placement is asserted at the
 * level the CSS module actually encodes; the rendered class wiring is pinned
 * in tests/components/ChatGPTMessage.test.tsx.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/chatgpt/ChatGPTMessage.module.css'),
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

describe('chatgpt message row anchoring (RTL-locked app, 11b §4.3)', () => {
  it('anchors the user bubble to the physical right (flex-start = inline start in RTL)', () => {
    const block = ruleBlock('userRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('justify-content: flex-start');
    expect(block).toContain('direction: rtl');
  });

  it('keeps assistantRow a plain column stack — no bubble, no cross-axis anchor', () => {
    const block = ruleBlock('assistantRow');
    expect(block).toContain('display: flex');
    expect(block).toContain('flex-direction: column');
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
    const pre = ruleBlock('assistantText pre');
    expect(pre).toContain('direction: ltr');
    expect(pre).toContain('text-align: left');
  });
});

describe('chatgpt message actions reveal (§4.3 Message Actions, 11b FR-8)', () => {
  // The module's header comment mentions these selectors too, so search a
  // comment-stripped copy — only real rules may satisfy the assertions.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('hides the action row by default and reveals it on row hover or keyboard focus', () => {
    expect(ruleBlock('actions')).toContain('opacity: 0');
    // Whitespace-agnostic: the two selectors may wrap across lines.
    const revealIndex = rules.indexOf('.row:hover .actions');
    expect(revealIndex).toBeGreaterThan(-1);
    const focusIndex = rules.indexOf('.row:focus-within .actions', revealIndex);
    expect(focusIndex).toBeGreaterThan(revealIndex);
    const revealBlock = rules.slice(rules.indexOf('{', focusIndex), rules.indexOf('}', focusIndex));
    expect(revealBlock).toContain('opacity: 1');
  });

  it('keeps actions always visible on touch-only surfaces (hover: none fallback)', () => {
    const mediaIndex = rules.indexOf('@media (hover: none)');
    expect(mediaIndex).toBeGreaterThan(-1);
    const block = rules.slice(rules.indexOf('{', mediaIndex), rules.indexOf('}', mediaIndex));
    expect(block).toContain('opacity: 1');
  });
});

describe('chatgpt message row has no model avatar (11b doc gap #4)', () => {
  it('defines no avatar rule, class or token anywhere in the module', () => {
    expect(css.toLowerCase()).not.toContain('avatar');
    expect(css).not.toContain('--chatgpt-avatar');
  });

  it('renders the assistant text directly on the page background, not in a bubble', () => {
    // The only bubble background the module may reference is the user bubble.
    const body = ruleBlock('assistantBody');
    expect(body).not.toContain('background');
    expect(css).not.toContain('--chatgpt-bubble-assistant-bg');
  });
});

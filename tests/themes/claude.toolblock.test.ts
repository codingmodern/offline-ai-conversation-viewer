import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks themes/claude/ToolBlock.module.css to the tool-card visual contract
 * (ui-context.md §4.4 → Tool Cards, plus the Session 14 token-collision fix):
 * the card can never exceed the assistant column, and the payload inset renders
 * on the theme's elevated surface — the same token the spec reserves for
 * modal/artifact panels — never the page base it previously collided with.
 * jsdom has no layout engine, so the declarations themselves are pinned here,
 * mirroring the other theme static locks.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/claude/ToolBlock.module.css'),
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

describe('claude tool card containment', () => {
  it('caps the card at the column width so a huge payload can never overflow it', () => {
    const block = ruleBlock('card');
    expect(block).toContain('max-width: 100%');
    expect(block).toContain('overflow: hidden');
  });

  it('renders payload insets on the elevated surface — not the page base (collision lock)', () => {
    const block = ruleBlock('payload');
    expect(block).toContain('background: var(--claude-bg-elevated)');
    expect(block).not.toContain('--claude-bg-base');
    // The inset keeps its own scrolls so an unbroken LTR string or a huge
    // tool output never expands the card past the column.
    expect(block).toContain('overflow-x: auto');
    expect(block).toContain('max-height: 60rem');
  });
});
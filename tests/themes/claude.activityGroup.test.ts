import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks themes/claude/ActivityGroup.module.css to the unified-toggle visual
 * contract (`09c-claude-unified-activity-toggle.md` FR5): the run reads as ONE
 * card on the shared tool surface — members separated by hairlines, never a
 * stack of bordered boxes — and the card can never exceed the assistant
 * column. jsdom has no layout engine, so the declarations themselves are
 * pinned here, mirroring the other theme static locks.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/claude/ActivityGroup.module.css'),
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

describe('claude unified activity group card', () => {
  it('sits on the shared tool surface and can never overflow the column', () => {
    const group = ruleBlock('group');
    expect(group).toContain('background: var(--claude-tool-bg)');
    expect(group).toContain('border: 1px solid var(--claude-tool-border)');
    expect(group).toContain('max-width: 100%');
    expect(group).toContain('overflow: hidden');
  });

  it('separates members with a hairline on the shared surface — not nested cards', () => {
    expect(css).toContain('border-top: 1px solid var(--claude-tool-border)');
  });
});

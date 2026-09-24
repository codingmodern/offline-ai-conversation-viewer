import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks themes/chatgpt/ActivityGroup.module.css to the unified-toggle visual
 * contract (11b FR-4 / FR-5): one `<details>` per contiguous run whose members
 * read as ONE card — separated by a single hairline, never a stack of bordered
 * boxes — and the group can never exceed the assistant column. Unlike Claude,
 * ChatGPT has no dedicated tool-card surface: the group sits transparent on the
 * page base, so no tool background token may appear here. jsdom has no layout
 * engine, so the declarations themselves are pinned, mirroring the other theme
 * static locks.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/chatgpt/ActivityGroup.module.css'),
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

describe('chatgpt unified activity group', () => {
  it('can never overflow the assistant column', () => {
    const group = ruleBlock('group');
    expect(group).toContain('max-width: 100%');
    expect(group).toContain('overflow: hidden');
    expect(group).toContain('min-width: 0');
  });

  it('sits transparent on the page base — ChatGPT has no tool-card surface', () => {
    const group = ruleBlock('group');
    expect(group).not.toContain('background');
    expect(css).not.toContain('--chatgpt-tool-bg');
  });

  it('separates members with a single hairline — not nested cards', () => {
    expect(css).toContain('.body > :not(:first-child)');
    expect(css).toContain('border-top: 1px solid var(--chatgpt-border-default)');
  });

  it('hides the native details marker so the summary renders as one quiet line', () => {
    expect(css).toContain('::-webkit-details-marker');
    const summary = ruleBlock('summary');
    expect(summary).toContain('list-style: none');
    expect(summary).not.toContain('font-weight');
  });
});

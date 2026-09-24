import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks `themes/claude/tokens.css` to the mandatory token set of
 * `ui-context.md` §4.1 categories and to §4.4's Clay Orange palette.
 *
 * Mirrors the DeepSeek tokens guard: every §4.1 category must stay present in
 * BOTH modes, because the theme follows the app-wide light/dark setting via
 * `prefers-color-scheme`.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/claude/tokens.css'),
  'utf8',
);

const DARK_MARKER = '@media (prefers-color-scheme: dark)';
const darkIndex = css.indexOf(DARK_MARKER);
const lightPart = css.slice(0, darkIndex);
const darkPart = darkIndex === -1 ? '' : css.slice(darkIndex);

const MODE_DEPENDENT_TOKENS: readonly string[] = [
  '--claude-bg-base',
  '--claude-bg-surface',
  '--claude-bg-elevated',
  '--claude-text-primary',
  '--claude-text-secondary',
  '--claude-text-muted',
  '--claude-bubble-user-bg',
  '--claude-bubble-user-text',
  '--claude-bubble-assistant-bg',
  '--claude-bubble-assistant-text',
  '--claude-accent-primary',
  '--claude-accent-hover',
  '--claude-thinking-text',
  '--claude-border-default',
  '--claude-tool-bg',
  '--claude-tool-border',
];

const MODE_INDEPENDENT_TOKENS: readonly string[] = [
  '--claude-font-sans',
  '--claude-font-mono',
  '--claude-font-serif',
  '--claude-radius-bubble',
  '--claude-radius-surface',
  '--claude-spacing-message-gap',
  '--claude-spacing-container-padding',
  '--claude-code-bg',
  '--claude-code-text',
];

describe('claude tokens.css (ui-context.md §4.1 / §4.4)', () => {
  it('defines every mode-dependent §4.1 token in both light and dark mode', () => {
    expect(darkPart).toContain(DARK_MARKER);
    for (const token of MODE_DEPENDENT_TOKENS) {
      expect(lightPart).toContain(`${token}:`);
      expect(darkPart).toContain(`${token}:`);
    }
  });

  it('defines every mode-independent §4.1 token', () => {
    for (const token of MODE_INDEPENDENT_TOKENS) {
      expect(css).toContain(`${token}:`);
    }
  });

  it('uses §4.4 Clay Orange as the accent, brightened for dark surfaces', () => {
    expect(lightPart).toContain('--claude-accent-primary: #c96442');
    expect(darkPart).toContain('--claude-accent-primary: #d97757');
  });

  it('has no thinking-background token — Thinking renders on the base background', () => {
    expect(css).not.toContain('--claude-thinking-bg');
    expect(lightPart).toContain('--claude-thinking-text:');
    expect(darkPart).toContain('--claude-thinking-text:');
  });

  it('keeps the assistant bubble background transparent in both modes', () => {
    expect(lightPart).toContain('--claude-bubble-assistant-bg: transparent');
    expect(darkPart).toContain('--claude-bubble-assistant-bg: transparent');
  });

  it('keeps code blocks on one dark charcoal background in both modes', () => {
    expect(css).toContain('--claude-code-bg: #1f1e1d');
  });

  it('matches the Shell page background exactly in both modes (seam fix)', () => {
    expect(lightPart).toContain('--claude-bg-base: #ffffff');
    expect(darkPart).toContain('--claude-bg-base: #16181d');
  });

  it('keeps the tool-card palette distinct from the surface and default borders in both modes', () => {
    // Session 14 collision lock: the pre-fix tool-bg duplicated
    // --claude-bg-surface and the tool border duplicated
    // --claude-border-default, erasing the card's boundary in both modes.
    // Values are pinned AND pairwise distinct from every token they could
    // re-collide with.
    expect(lightPart).toContain('--claude-tool-bg: #ece9de');
    expect(lightPart).toContain('--claude-tool-border: #d6d1c3');
    expect(darkPart).toContain('--claude-tool-bg: #343430');
    expect(darkPart).toContain('--claude-tool-border: #4a4a46');

    const readValue = (part: string, token: string): string => {
      const match = part.match(new RegExp(`${token}:\\s*([^;]+);`));
      const group = match?.[1];
      if (group === undefined) {
        throw new Error(`${token} is missing from the token sheet.`);
      }
      return group.trim();
    };

    for (const part of [lightPart, darkPart]) {
      expect(readValue(part, '--claude-tool-bg')).not.toBe(readValue(part, '--claude-bg-surface'));
      expect(readValue(part, '--claude-tool-bg')).not.toBe(readValue(part, '--claude-bg-base'));
      expect(readValue(part, '--claude-tool-bg')).not.toBe(readValue(part, '--claude-bg-elevated'));
      expect(readValue(part, '--claude-tool-border')).not.toBe(
        readValue(part, '--claude-border-default'),
      );
    }
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks `themes/deepseek/tokens.css` to the mandatory token set of
 * `ui-context.md` §4.1 and to the screenshot-corrected §4.6 values (ADR #17).
 *
 * This is the guard the ADR promises: a token may never regress to the old
 * guessed values (`~#22283A`, `--deepseek-thinking-bg`), and every §4.1
 * category must stay present in BOTH modes, because the theme follows the
 * app-wide light/dark setting via `prefers-color-scheme`.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/deepseek/tokens.css'),
  'utf8',
);

const DARK_MARKER = '@media (prefers-color-scheme: dark)';
const darkIndex = css.indexOf(DARK_MARKER);
const lightPart = css.slice(0, darkIndex);
const darkPart = darkIndex === -1 ? '' : css.slice(darkIndex);

/** §4.1's mandatory tokens whose value differs per mode (§4.6 color tables). */
const MODE_DEPENDENT_TOKENS: readonly string[] = [
  '--deepseek-bg-base',
  '--deepseek-bg-surface',
  '--deepseek-bg-elevated',
  '--deepseek-text-primary',
  '--deepseek-text-secondary',
  '--deepseek-text-muted',
  '--deepseek-bubble-user-bg',
  '--deepseek-bubble-user-text',
  '--deepseek-bubble-assistant-bg',
  '--deepseek-bubble-assistant-text',
  '--deepseek-accent-primary',
  '--deepseek-accent-hover',
  '--deepseek-thinking-text',
  '--deepseek-border-default',
];

/** Mandatory tokens that are mode-independent (§4.6 typography/spacing tables
    have no mode column; code blocks keep one dark background in both modes). */
const MODE_INDEPENDENT_TOKENS: readonly string[] = [
  '--deepseek-font-sans',
  '--deepseek-font-mono',
  '--deepseek-radius-bubble',
  '--deepseek-radius-surface',
  '--deepseek-spacing-message-gap',
  '--deepseek-spacing-container-padding',
  '--deepseek-code-bg',
  '--deepseek-code-text',
];

describe('deepseek tokens.css (ui-context.md §4.1 / §4.6, ADR #17)', () => {
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

  it('uses the screenshot-corrected neutral gray for the dark user bubble', () => {
    expect(darkPart).toContain('--deepseek-bubble-user-bg: #2a2a2a');
    // The superseded blue-tinted guess must be gone in every form.
    expect(css.toLowerCase()).not.toContain('#22283a');
  });

  it('has no thinking-background token — Thinking renders on the base background', () => {
    expect(css).not.toContain('--deepseek-thinking-bg');
    expect(lightPart).toContain('--deepseek-thinking-text:');
    expect(darkPart).toContain('--deepseek-thinking-text:');
  });

  it('keeps the assistant bubble background transparent in both modes', () => {
    expect(lightPart).toContain('--deepseek-bubble-assistant-bg: transparent');
    expect(darkPart).toContain('--deepseek-bubble-assistant-bg: transparent');
  });
});

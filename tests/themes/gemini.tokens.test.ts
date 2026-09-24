import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks `themes/gemini/tokens.css` to the mandatory token set of
 * `ui-context.md` §4.1 categories and to §4.5's Material 3 Expressive palette.
 *
 * Mirrors the Claude tokens guard: every §4.1 category must stay present in
 * BOTH modes, because the theme follows the app-wide light/dark setting via
 * `prefers-color-scheme`.
 */

const css = readFileSync(resolve(process.cwd(), 'src/themes/gemini/tokens.css'), 'utf8');

const DARK_MARKER = '@media (prefers-color-scheme: dark)';
const darkIndex = css.indexOf(DARK_MARKER);
const lightPart = css.slice(0, darkIndex);
const darkPart = darkIndex === -1 ? '' : css.slice(darkIndex);

const MODE_DEPENDENT_TOKENS: readonly string[] = [
  '--gemini-bg-base',
  '--gemini-bg-surface',
  '--gemini-bg-elevated',
  '--gemini-text-primary',
  '--gemini-text-secondary',
  '--gemini-text-muted',
  '--gemini-bubble-user-bg',
  '--gemini-bubble-user-text',
  '--gemini-bubble-assistant-bg',
  '--gemini-bubble-assistant-text',
  '--gemini-accent-primary',
  '--gemini-accent-hover',
  '--gemini-link-text',
  '--gemini-border-default',
  '--gemini-code-bg',
  '--gemini-code-text',
  '--gemini-error-text',
];

const MODE_INDEPENDENT_TOKENS: readonly string[] = [
  '--gemini-font-sans',
  '--gemini-font-mono',
  '--gemini-radius-bubble',
  '--gemini-radius-surface',
  '--gemini-radius-input',
  '--gemini-spacing-message-gap',
  '--gemini-spacing-container-padding',
];

describe('gemini tokens.css (ui-context.md §4.1 / §4.5)', () => {
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

  it('uses §4.5 Google blue as the accent and the darker hover value', () => {
    expect(lightPart).toContain('--gemini-accent-primary: #4285f4');
    expect(lightPart).toContain('--gemini-accent-hover: #3367d6');
    // §4.5: "the same, brightness balanced" for dark surfaces.
    expect(darkPart).toContain('--gemini-accent-primary: #8ab4f8');
  });

  it('keeps the §4.5 user-bubble values verbatim in both modes', () => {
    expect(lightPart).toContain('--gemini-bubble-user-bg: #e8eef9');
    expect(darkPart).toContain('--gemini-bubble-user-bg: #3b3f45');
  });

  it('keeps the §4.5 surface, border and warm dark base values verbatim', () => {
    expect(lightPart).toContain('--gemini-bg-surface: #f0f4f9');
    expect(lightPart).toContain('--gemini-border-default: #dadce0');
    // "Warm dark grey, not pure black."
    expect(darkPart).toContain('--gemini-bg-base: #1e1f20');
    expect(darkPart).toContain('--gemini-bg-surface: #282a2c');
    expect(darkPart).toContain('--gemini-border-default: #3c4043');
  });

  it('keeps the assistant answer unbubbled in both modes', () => {
    expect(lightPart).toContain('--gemini-bubble-assistant-bg: transparent');
    expect(darkPart).toContain('--gemini-bubble-assistant-bg: transparent');
  });

  it('keeps a link colour that clears AA where the brand blue cannot', () => {
    // §4.5's brand blue reaches ~3.6:1 on white; §13's floor is 4.5:1, so body
    // links use the darker blue (the theme file documents this reading).
    expect(lightPart).toContain('--gemini-link-text: #1a73e8');
    expect(darkPart).toContain('--gemini-link-text: #8ab4f8');
  });

  it('has no thinking-background or tool-card token — Gemini exports neither', () => {
    expect(css).not.toContain('--gemini-thinking');
    expect(css).not.toContain('--gemini-tool');
  });

  it('keeps code surfaces distinct from the page surface in both modes', () => {
    const readValue = (part: string, token: string): string => {
      const match = part.match(new RegExp(`${token}:\\s*([^;]+);`));
      const group = match?.[1];
      if (group === undefined) {
        throw new Error(`${token} is missing from the token sheet.`);
      }
      return group.trim();
    };

    for (const part of [lightPart, darkPart]) {
      expect(readValue(part, '--gemini-code-bg')).not.toBe(readValue(part, '--gemini-bg-surface'));
      expect(readValue(part, '--gemini-code-bg')).not.toBe(readValue(part, '--gemini-bg-base'));
    }
  });

  it('keeps the §4.5 radii and spacing on the sheet', () => {
    expect(css).toContain('--gemini-radius-bubble: 20px');
    expect(css).toContain('--gemini-radius-surface: 16px');
    expect(css).toContain('--gemini-radius-input: 9999px');
    expect(css).toContain('--gemini-spacing-message-gap: 2.5rem');
  });
});
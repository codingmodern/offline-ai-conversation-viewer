import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks `themes/chatgpt/tokens.css` to the §4.1 mandatory token categories and
 * to §4.3's neutral grey palette (11b). Mirrors the Claude/DeepSeek tokens
 * guard: every §4.1 category must stay present in BOTH modes, because the theme
 * follows the app-wide light/dark setting via `prefers-color-scheme`.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/themes/chatgpt/tokens.css'),
  'utf8',
);

const DARK_MARKER = '@media (prefers-color-scheme: dark)';
const darkIndex = css.indexOf(DARK_MARKER);
const lightPart = css.slice(0, darkIndex);
const darkPart = darkIndex === -1 ? '' : css.slice(darkIndex);

const MODE_DEPENDENT_TOKENS: readonly string[] = [
  '--chatgpt-bg-base',
  '--chatgpt-bg-surface',
  '--chatgpt-bg-elevated',
  '--chatgpt-text-primary',
  '--chatgpt-text-secondary',
  '--chatgpt-text-muted',
  '--chatgpt-bubble-user-bg',
  '--chatgpt-bubble-user-text',
  '--chatgpt-bubble-assistant-bg',
  '--chatgpt-bubble-assistant-text',
  '--chatgpt-accent-primary',
  '--chatgpt-accent-hover',
  '--chatgpt-border-default',
  '--chatgpt-code-bg',
  '--chatgpt-code-text',
  '--chatgpt-code-inline-bg',
];

const MODE_INDEPENDENT_TOKENS: readonly string[] = [
  '--chatgpt-font-sans',
  '--chatgpt-font-mono',
  '--chatgpt-radius-bubble',
  '--chatgpt-radius-surface',
  '--chatgpt-spacing-message-gap',
  '--chatgpt-spacing-container-padding',
  '--chatgpt-max-content-width',
];

describe('chatgpt tokens.css (ui-context.md §4.1 / §4.3, 11b)', () => {
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

  it('keeps the page base on the neutral ChatGPT grey in both modes', () => {
    expect(lightPart).toContain('--chatgpt-bg-base: #ffffff');
    expect(darkPart).toContain('--chatgpt-bg-base: #212121');
  });

  it('keeps the user bubble a NEUTRAL grey — never blue (11b FR-1 / ADR-M)', () => {
    // The blue in the owner's screenshots is a personal accent setting, not a
    // product default: the bubble stays neutral in both modes and no blue
    // bubble token exists.
    expect(lightPart).toContain('--chatgpt-bubble-user-bg: #f4f4f4');
    expect(darkPart).toContain('--chatgpt-bubble-user-bg: #2f2f2f');
    expect(css).not.toContain('--chatgpt-bubble-user-bg: #10a37f');
    expect(css).not.toContain('--chatgpt-bubble-user-bg: #0d8a6c');
  });

  it('keeps the assistant side transparent in both modes (no bubble, no avatar)', () => {
    expect(lightPart).toContain('--chatgpt-bubble-assistant-bg: transparent');
    expect(darkPart).toContain('--chatgpt-bubble-assistant-bg: transparent');
  });

  it('keeps the accent on the single ChatGPT green in both modes', () => {
    expect(lightPart).toContain('--chatgpt-accent-primary: #10a37f');
    expect(darkPart).toContain('--chatgpt-accent-primary: #10a37f');
  });

  it('keeps code blocks on one dark charcoal slab in both modes', () => {
    expect(lightPart).toContain('--chatgpt-code-bg: #0d0d0d');
    expect(darkPart).toContain('--chatgpt-code-bg: #0d0d0d');
    expect(lightPart).toContain('--chatgpt-code-text: #ececec');
    expect(darkPart).toContain('--chatgpt-code-text: #ececec');
  });

  it('keeps the inline-code chip off the dark code slab (collision lock)', () => {
    // The chip intentionally REUSES the user-bubble neutral (a documented
    // non-collision, unlike Claude's tool card), but it must never inherit the
    // dark slab the fenced block owns.
    const readValue = (part: string, token: string): string => {
      const match = part.match(new RegExp(`${token}:\\s*([^;]+);`));
      const group = match?.[1];
      if (group === undefined) {
        throw new Error(`${token} is missing from the token sheet.`);
      }
      return group.trim();
    };
    expect(lightPart).toContain('--chatgpt-code-inline-bg: #f4f4f4');
    expect(darkPart).toContain('--chatgpt-code-inline-bg: #2f2f2f');
    for (const part of [lightPart, darkPart]) {
      expect(readValue(part, '--chatgpt-code-inline-bg')).not.toBe(
        readValue(part, '--chatgpt-code-bg'),
      );
    }
  });

  it('has no thinking-background token — reasoning renders on the base background', () => {
    expect(css).not.toContain('--chatgpt-thinking-bg');
    expect(css).not.toContain('--chatgpt-thinking-text');
  });

  it('collapses text-secondary and text-muted onto one level (§4.3 has one secondary)', () => {
    expect(lightPart).toContain('--chatgpt-text-secondary: #6e6e80');
    expect(darkPart).toContain('--chatgpt-text-secondary: #b4b4b4');
    expect(lightPart).toContain('--chatgpt-text-muted: #6e6e80');
    expect(darkPart).toContain('--chatgpt-text-muted: #b4b4b4');
  });
});

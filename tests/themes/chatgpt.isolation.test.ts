import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The theme-isolation guard for `src/themes/chatgpt/` (11b ADR-J). No existing
 * scan forbids cross-theme imports or out-of-token hex, so this test adds both:
 *
 * 1. Every ChatGPT module is a standalone copy of its Claude twin — importing
 *    another theme's folder would make the "theme" a wrapper and violate the
 *    no-cross-theme-import rule every other theme obeys.
 * 2. Every colour in the folder flows through a `--chatgpt-*` custom property:
 *    a hardcoded hex inside a .tsx file would bypass the token sheet and break
 *    light/dark switching.
 */

const THEME_DIR = join(process.cwd(), 'src', 'themes', 'chatgpt');

function listFiles(dir: string): readonly string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...listFiles(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

const files = listFiles(THEME_DIR);
const codeFiles = files.filter((file) => /\.(ts|tsx)$/.test(file));

describe('chatgpt theme isolation (11b ADR-J)', () => {
  it('discovers the theme folder and at least its entry modules', () => {
    expect(codeFiles.length).toBeGreaterThan(0);
    expect(codeFiles.some((file) => file.endsWith('ChatGPTConversationView.tsx'))).toBe(true);
    expect(codeFiles.some((file) => file.endsWith('tokens.css'))).toBe(false); // css, not code
  });

  it('imports no other theme folder — each module is a standalone copy', () => {
    const forbidden = /from\s+['"]@?\/?\.?\.?\/?themes\/(claude|deepseek|gemini)\b/;
    for (const file of codeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import another theme`).not.toMatch(forbidden);
    }
  });

  it('never reaches outside the theme except for shared app modules', () => {
    // Shared modules every theme may use: react, react-i18next, @/i18n, lucide-react,
    // marked, dompurify, the shared types, and its own relative modules. Anything else
    // crossing the folder boundary needs an explicit allow-list here.
    const allowedExternal = /^(react|react-i18next|@\/i18n|lucide-react|marked|dompurify|@\/types\/conversation)/;
    const importPattern = /(?:from|import)\s+['"]([^'"]+)['"]/g;
    for (const file of codeFiles) {
      const source = readFileSync(file, 'utf8');
      const matches = [...source.matchAll(importPattern)].map((match) => match[1] ?? '');
      for (const specifier of matches) {
        const isRelative = specifier.startsWith('.') || specifier.startsWith('@/themes/chatgpt');
        const isTokenImport = specifier.endsWith('tokens.css');
        expect(
          isRelative || isTokenImport || allowedExternal.test(specifier),
          `${file} imports unexpected module: ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it('hardcodes no hex colour inside a component — colour flows through tokens', () => {
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
    for (const file of codeFiles) {
      const source = readFileSync(file, 'utf8');
      // Strip comments so documentation references to the palette don't trip.
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(withoutComments, `${file} hardcodes a colour`).not.toMatch(hexPattern);
    }
  });

  it('keeps every css custom property inside the --chatgpt-* namespace', () => {
    const cssFiles = files.filter((file) => file.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);
    const foreignVar = /var\(--(?!chatgpt-|shell-)[a-z-]+\)/;
    for (const file of cssFiles) {
      const source = readFileSync(file, 'utf8');
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(withoutComments, `${file} references a foreign token`).not.toMatch(foreignVar);
    }
  });
});

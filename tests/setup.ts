import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom does not implement `Blob.prototype.text()` (available in every target
 * browser), so it is polyfilled via `FileReader` for tests only. Production code
 * keeps using the native method.
 */
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function readAsText(this: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = (): void => {
        reject(reader.error ?? new Error('FileReader failed.'));
      };

      reader.readAsText(this);
    });
  };
}

/**
 * Unit 12 (bilingual UI): act as a **returning Persian user** for the whole
 * suite by seeding the stored language choice before i18next initializes.
 *
 * Two reasons this lives here rather than in individual test files:
 *   - the stored value is what `App` reads to decide whether to show the
 *     first-run onboarding; without it every existing test that renders `App`
 *     would land on the language chooser instead of the shell;
 *   - every suite asserts on the app's Persian copy, and the Persian locale is
 *     the exact text those assertions were written against — so the language must
 *     be Persian *before* the first render, exactly as it is for a real returning
 *     user.
 *
 * The seed has to happen before `@/i18n` is evaluated (it resolves the boot
 * language at import time), which is why the import below is dynamic: a static
 * import would be hoisted above this assignment. Initializing the singleton here
 * also covers suites that render theme components without importing `App`.
 *
 * Tests that specifically cover the onboarding/switch behaviour remove the key
 * themselves — see `tests/i18n/bilingualUi.test.tsx`.
 */
window.localStorage.setItem('app-language', 'fa');

await import('@/i18n');
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

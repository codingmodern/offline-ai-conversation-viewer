import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  isJsonFile,
  isLargeFile,
  LARGE_FILE_WARNING_BYTES,
} from '@/features/import/fileTypeGuard';

/** Builds a File whose reported size is forced, without allocating the bytes. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File(['{}'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('isJsonFile', () => {
  it('accepts a .json file with the JSON MIME type', () => {
    expect(isJsonFile(new File(['{}'], 'chat.json', { type: 'application/json' }))).toBe(true);
  });

  it('accepts a .json file whose MIME type the OS did not report', () => {
    expect(isJsonFile(new File(['{}'], 'chat.json', { type: '' }))).toBe(true);
  });

  it('accepts an uppercase extension', () => {
    expect(isJsonFile(new File(['{}'], 'CHAT.JSON', { type: '' }))).toBe(true);
  });

  it.each([
    ['text file', 'notes.txt', 'text/plain'],
    ['markdown', 'chat.md', 'text/markdown'],
    ['zip archive', 'export.zip', 'application/zip'],
    ['html', 'chat.html', 'text/html'],
  ])('rejects a non-JSON file (%s)', (_label, name, type) => {
    expect(isJsonFile(new File(['x'], name, { type }))).toBe(false);
  });
});

describe('isLargeFile', () => {
  it('flags a file above the 50MB threshold', () => {
    expect(
      isLargeFile(fileOfSize('big.json', 'application/json', LARGE_FILE_WARNING_BYTES + 1)),
    ).toBe(true);
  });

  it('does not flag a file exactly at the threshold', () => {
    expect(isLargeFile(fileOfSize('edge.json', 'application/json', LARGE_FILE_WARNING_BYTES))).toBe(
      false,
    );
  });
});

describe('formatFileSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i bytes', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

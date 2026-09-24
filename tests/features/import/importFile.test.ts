import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedConversation } from '@/types/conversation';

// Mocked so no real Worker is spawned: jsdom has no Worker support, and the
// worker's own logic is covered by `validateJsonText.test.ts`, the detection
// suites and `parseConversations.test.ts`.
vi.mock('@/features/import/workerClient', () => ({
  processFileInWorker: vi.fn(),
}));

const { processFileInWorker } = await import('@/features/import/workerClient');
const { importFile } = await import('@/features/import/importFile');
const mockedProcess = vi.mocked(processFileInWorker);

const conversation: UnifiedConversation = {
  sourceProvider: 'deepseek',
  sourceConversationId: 'c1',
  title: 'hi',
  messages: [
    { role: 'user', kind: 'text', content: 'hi', sourceFragmentType: 'REQUEST', order: 0 },
  ],
};

describe('importFile', () => {
  beforeEach(() => {
    mockedProcess.mockReset();
  });

  it('rejects a non-JSON file without touching the worker', async () => {
    const result = await importFile(new File(['x'], 'notes.txt', { type: 'text/plain' }), 'req-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UnsupportedFileTypeError');
    }
    expect(mockedProcess).not.toHaveBeenCalled();
  });

  it('returns the file name, provider id and normalized conversations on success', async () => {
    mockedProcess.mockResolvedValue({
      ok: true,
      data: { providerId: 'deepseek', conversations: [conversation] },
    });

    const result = await importFile(
      new File(['{}'], 'chat.json', { type: 'application/json' }),
      'req-2',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        fileName: 'chat.json',
        providerId: 'deepseek',
        conversations: [conversation],
      });
    }
  });

  it('hands off conversations without persisting them anywhere', async () => {
    mockedProcess.mockResolvedValue({
      ok: true,
      data: { providerId: 'deepseek', conversations: [conversation] },
    });

    const result = await importFile(
      new File(['{}'], 'chat.json', { type: 'application/json' }),
      'req-3',
    );

    // Unit 03 ends at the hand-off: storage arrives in a later unit, so the
    // result is the only place the conversations exist.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.conversations).toHaveLength(1);
    }
  });

  it('passes a worker failure through unchanged', async () => {
    mockedProcess.mockResolvedValue({ ok: false, error: { code: 'MalformedJsonError' } });

    const result = await importFile(
      new File(['{'], 'chat.json', { type: 'application/json' }),
      'req-4',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MalformedJsonError');
    }
  });

  it('passes an unsupported-format failure through unchanged', async () => {
    mockedProcess.mockResolvedValue({ ok: false, error: { code: 'UnsupportedFormatError' } });

    const result = await importFile(
      new File(['[1]'], 'chat.json', { type: 'application/json' }),
      'req-5',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UnsupportedFormatError');
    }
  });

  it.each(['MissingFieldError', 'UnexpectedTypeError'] as const)(
    'passes a %s parse failure through unchanged',
    async (code) => {
      mockedProcess.mockResolvedValue({ ok: false, error: { code } });

      const result = await importFile(
        new File(['[{}]'], 'chat.json', { type: 'application/json' }),
        'req-6',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
      }
    },
  );

  it('forwards the request id so responses can be correlated', async () => {
    mockedProcess.mockResolvedValue({
      ok: true,
      data: { providerId: 'deepseek', conversations: [] },
    });
    const file = new File(['{}'], 'chat.json', { type: 'application/json' });

    await importFile(file, 'req-7');

    expect(mockedProcess).toHaveBeenCalledWith(file, 'req-7');
  });
});

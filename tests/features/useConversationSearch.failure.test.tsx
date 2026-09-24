import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageResult, SearchIndexEntry } from '@/types/storage';
import { useConversationSearch } from '@/features/search/useConversationSearch';

/**
 * Failure-path degradation, in isolation: the storage subscription is mocked so
 * the exact emission under test can be delivered deterministically (ADR #19's
 * «degrade silently» rule) without staging an IndexedDB outage.
 *
 * The fake is a **plain function**, not `vi.fn()`: the shared setup calls
 * `vi.restoreAllMocks()` after every test, which would strip an injected
 * implementation between cases — a plain closure carries none.
 */

let emit: (result: StorageResult<readonly SearchIndexEntry[]>) => void;

vi.mock('@/storage/conversationStore', () => ({
  subscribeToSearchIndex: (
    onChange: (result: StorageResult<readonly SearchIndexEntry[]>) => void,
  ): { unsubscribe: () => void } => {
    emit = onChange;
    return { unsubscribe: (): void => undefined };
  },
}));

describe('useConversationSearch → index read failure', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('degrades to honest zero-results instead of crashing or faking data (§5)', () => {
    const { result } = renderHook(() => useConversationSearch());

    act(() => {
      emit({
        ok: false,
        error: { code: 'StorageReadError', detail: 'simulate: Dexie.UncaughtError' },
      });
    });

    act(() => {
      result.current.setQuery('هر چیزی');
    });

    expect(result.current.isSearching).toBe(true);
    expect(result.current.matchedIds).toEqual([]);
    // Detail went to the console, never to any UI surface:
    const loggedLines = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part));
    expect(loggedLines.some((line) => line.includes('search-index'))).toBe(true);
  });

  it('keeps searching usable once the index recovers on a later emission', () => {
    const { result } = renderHook(() => useConversationSearch());

    act(() => {
      emit({ ok: false, error: { code: 'StorageReadError' } });
    });
    act(() => {
      emit({
        ok: true,
        data: [{ conversationId: 5, searchableText: 'recoverable' }],
      });
    });

    act(() => {
      result.current.setQuery('recover');
    });
    expect(result.current.matchedIds).toEqual([5]);
  });
});

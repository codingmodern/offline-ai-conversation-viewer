import 'fake-indexeddb/auto';
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect } from 'vitest';
import { db } from '@/storage/db';
import { saveConversation } from '@/storage/conversationStore';
import { useConversationSearch, type UseConversationSearchResult } from '@/features/search/useConversationSearch';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * The hook against the REAL storage layer (`code-standards.md` §6): each test
 * saves into the shared `db` and clears it again, exactly as
 * `useActiveConversation` does, so `liveQuery` change notifications are
 * guaranteed to fire.
 */

beforeEach(async () => {
  await db.conversations.clear();
});

afterEach(async () => {
  await db.conversations.clear();
});

/** Renders the hook and resolves once the first live emission has landed. */
async function renderSettledHook(): Promise<RenderHookResult<UseConversationSearchResult, unknown>> {
  const rendered = renderHook(() => useConversationSearch());
  // `isIndexReady` flips only when a real emission arrived — the honest
  // readiness signal, so queries never race an index that has not loaded yet.
  await waitFor(() => {
    expect(rendered.result.current.isIndexReady).toBe(true);
  });
  return rendered;
}

describe('useConversationSearch', () => {
  it('matches by title across a conversation stored before mount (FR2/FR5)', async () => {
    await saveConversation(
      makeConversation({ sourceConversationId: 't-title', title: 'قرارداد اجاره' }),
      db,
    );
    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('اجاره');
    });

    expect(result.current.isSearching).toBe(true);
    expect(result.current.matchedIds).toHaveLength(1);
  });

  it('matches inside message content, not just titles (FR3)', async () => {
    await saveConversation(
      makeConversation({
        sourceConversationId: 't-content',
        title: 'یادداشت‌های روزانه',
        messages: [makeMessage({ content: 'رمز عبور وای‌فای عوض شد' })],
      }),
      db,
    );
    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('وای‌فای');
    });

    expect(result.current.matchedIds).toHaveLength(1);
  });

  it('reaches attachments through their file names (approved Decision 1)', async () => {
    const saved = await saveConversation(
      makeConversation({
        sourceConversationId: 't-attachment',
        title: 'مستندات',
        messages: [
          makeMessage({
            kind: 'attachment',
            sourceFragmentType: 'FILE',
            attachments: [{ fileId: 'f', fileName: 'invoice-farvardin.pdf', fileSize: 10 }],
          }),
        ],
      }),
      db,
    );

    const { result } = await renderSettledHook();
    act(() => {
      result.current.setQuery('invoice');
    });

    expect(result.current.matchedIds).toEqual([
      saved.ok && saved.data.status === 'saved' ? saved.data.id : -1,
    ]);
  });

  it('never matches tool_activity payloads (ADR #18 boundary held end-to-end)', async () => {
    await saveConversation(
      makeConversation({
        sourceConversationId: 't-tool',
        title: 'تحقیق بازار',
        messages: [
          makeMessage({
            role: 'assistant',
            kind: 'tool_activity',
            sourceFragmentType: 'SEARCH',
            order: 0,
            toolActivity: { activityType: 'SEARCH', results: ['نتیجه‌ی درون ابزار'] },
          }),
          makeMessage({ role: 'user', sourceFragmentType: 'REQUEST', order: 1, content: 'سلام' }),
        ],
      }),
      db,
    );

    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('نتیجه‌ی درون ابزار');
    });
    expect(result.current.matchedIds).toEqual([]);

    act(() => {
      result.current.setQuery('سلام');
    });
    expect(result.current.matchedIds).toHaveLength(1);
  });

  it('returns zero results for a term no record contains (FR8 - valid state, not an error)', async () => {
    await saveConversation(
      makeConversation({ sourceConversationId: 't-zero', title: 'فهرست هفته' }),
      db,
    );
    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('عصرانه بیدمشک');
    });

    expect(result.current.isSearching).toBe(true);
    expect(result.current.matchedIds).toEqual([]);
  });

  it('restores no-active-search when the term is cleared (FR7)', async () => {
    await saveConversation(
      makeConversation({ sourceConversationId: 't-clear', title: 'گفتگوی ویژه' }),
      db,
    );
    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('ویژه');
    });
    expect(result.current.isSearching).toBe(true);

    act(() => {
      result.current.clearQuery();
    });

    expect(result.current.query).toBe('');
    expect(result.current.isSearching).toBe(false);
    expect(result.current.matchedIds).toEqual([]);
  });

  it('matches Persian digit terms verbatim through the live-query round trip', async () => {
    await saveConversation(
      makeConversation({
        sourceConversationId: 't-persian',
        messages: [makeMessage({ content: 'پرداخت در سال ۱۴۰۳ انجام شد' })],
      }),
      db,
    );
    const { result } = await renderSettledHook();

    act(() => {
      result.current.setQuery('۱۴۰۳');
    });
    expect(result.current.matchedIds).toHaveLength(1);

    // ASCII digit query does NOT match Persian digits: same family of pitfall
    // already documented in ADR #19. Asserting it pins the v1 contract.
    act(() => {
      result.current.setQuery('1403');
    });
    expect(result.current.matchedIds).toEqual([]);
  });
});

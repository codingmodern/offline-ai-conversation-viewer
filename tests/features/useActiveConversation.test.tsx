import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/storage/db';
import { deleteConversation, saveConversation } from '@/storage/conversationStore';
import { useActiveConversation } from '@/features/library/useActiveConversation';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * The hook is the seam between selection state (`activeId`) and Unit 06's
 * themed renderer. Like `useActiveConversationMetadata`'s suite, these tests
 * drive the REAL storage layer over `fake-indexeddb`: resolve on selection,
 * nothing read when nothing is selected, empty read when a record vanished,
 * and a clean swap when the selection changes.
 */

/** Seeds one conversation and returns its assigned library id. */
async function seed(options: Parameters<typeof makeConversation>[0]): Promise<{ readonly id: number }> {
  const conversation = makeConversation(options);
  const saved = await saveConversation(conversation);
  if (!saved.ok || saved.data.status !== 'saved') {
    throw new Error(`Seeding failed for ${conversation.sourceConversationId}.`);
  }
  return { id: saved.data.id };
}

/** Waits out React-external async work so pending state updates land inside act. */
async function flushAsync(ms = 250): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

describe('useActiveConversation', () => {
  beforeEach(async () => {
    await db.conversations.clear();
  });

  afterEach(async () => {
    await db.conversations.clear();
  });

  it('resolves the full unified record for the active id', async () => {
    const record = await seed({
      sourceConversationId: 'c-1',
      title: 'گفتگوی فعال',
      messages: [makeMessage({ content: 'پیام کامل' })],
    });

    const { result } = renderHook(() => useActiveConversation(record.id));

    await flushAsync();
    expect(result.current.conversation?.sourceConversationId).toBe('c-1');
    expect(result.current.conversation?.title).toBe('گفتگوی فعال');
    expect(result.current.conversation?.messages[0]?.content).toBe('پیام کامل');
  });

  it('resolves nothing while nothing is selected', () => {
    const { result } = renderHook(() => useActiveConversation(undefined));

    // No id → no read scheduled; the initial undefined state simply holds.
    expect(result.current.conversation).toBeUndefined();
  });

  it('degrades to nothing when the record no longer exists (out-of-band deletion)', async () => {
    const record = await seed({ sourceConversationId: 'gone' });
    // Removed behind the app's back — the next read is legitimately empty, not
    // an error (`getConversation` contract).
    await deleteConversation(record.id);

    const { result } = renderHook(() => useActiveConversation(record.id));

    await flushAsync(100);
    expect(result.current.conversation).toBeUndefined();
  });

  it('replaces the record when the selection changes', async () => {
    const first = await seed({ sourceConversationId: 'c-1' });
    const second = await seed({ sourceConversationId: 'c-2' });

    const { result, rerender } = renderHook(
      ({ id }: { id: number | undefined }) => useActiveConversation(id),
      { initialProps: { id: first.id as number | undefined } },
    );
    await flushAsync();
    expect(result.current.conversation?.sourceConversationId).toBe('c-1');

    rerender({ id: second.id });
    await flushAsync();
    expect(result.current.conversation?.sourceConversationId).toBe('c-2');
  });
});

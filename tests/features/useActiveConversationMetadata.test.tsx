import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/storage/db';
import { deleteConversation, saveConversation } from '@/storage/conversationStore';
import { useActiveConversationMetadata } from '@/features/library/useActiveConversationMetadata';
import { makeConversation } from '../fixtures/conversations';

/**
 * The hook is the seam between selection state (`activeId`) and the Metadata
 * Panel's fields. Like `tests/components/AppShell.test.tsx`, these tests drive
 * the REAL storage layer over `fake-indexeddb`: mocking the module boundary
 * proved brittle, while the real round-trip proves the contract end-to-end —
 * resolve on selection, empty read when a record vanished, nothing read when
 * nothing is selected. A failed *read* (ok:false) shares the exact
 * `result.ok ? data : undefined` guard proven by the vanished-record case.
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

describe('useActiveConversationMetadata', () => {
  beforeEach(async () => {
    await db.conversations.clear();
  });

  afterEach(async () => {
    await db.conversations.clear();
  });

  it('resolves present fields for the active record', async () => {
    const record = await seed({
      sourceConversationId: 'c-1',
      title: 'عنوان فعال',
      createdAt: '2026-01-02T10:30:00Z',
    });

    const { result } = renderHook(() => useActiveConversationMetadata(record.id));

    // The read resolves outside React's act scope, so the pending work is
    // flushed explicitly before asserting (waitFor alone misses these updates
    // under React 19 + RTL).
    await flushAsync();
    expect(result.current.fields.map((field) => field.key)).toEqual(['title', 'createdAt']);
  });

  it('shows nothing while nothing is selected', async () => {
    const { result } = renderHook(() => useActiveConversationMetadata(undefined));

    // No id → no read scheduled; the initial empty state simply holds.
    expect(result.current.fields).toEqual([]);
  });

  it('degrades to empty fields when the record no longer exists (out-of-band deletion)', async () => {
    const record = await seed({ sourceConversationId: 'gone', title: 'حذف‌شده' });
    // Removed behind the app's back — the next read is legitimately empty, not
    // an error (`04-local-chat-library.md`; `getConversation` contract).
    await deleteConversation(record.id);

    const { result } = renderHook(() => useActiveConversationMetadata(record.id));

    // Give any in-flight read time to settle, then assert the degraded state —
    // a missing id is an empty read (`getConversation` contract), never an error.
    await flushAsync(100);
    expect(result.current.fields).toEqual([]);
  });

  it('replaces fields when the selection changes', async () => {
    const first = await seed({ sourceConversationId: 'c-1', title: 'اول' });
    const second = await seed({ sourceConversationId: 'c-2', title: 'دوم' });

    const { result, rerender } = renderHook(
      ({ id }: { id: number | undefined }) => useActiveConversationMetadata(id),
      { initialProps: { id: first.id as number | undefined } },
    );
    // Flush after the initial read…
    await flushAsync();
    expect(result.current.fields.map((field) => field.value)).toEqual(['اول']);

    // …then switch selections and flush again; the panel must show only the
    // newly selected record's fields.
    rerender({ id: second.id });
    await flushAsync();
    expect(result.current.fields.map((field) => field.value)).toEqual(['دوم']);
  });
});


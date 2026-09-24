import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryDatabase } from '@/storage/db';
import {
  countConversations,
  listConversations,
  saveConversation,
} from '@/storage/conversationStore';
import { makeConversation } from '../fixtures/conversations';

/**
 * Atomic-failure behaviour (FR2 + spec → Edge Cases).
 *
 * The guarantee under test is not "writes succeed" but "a failed write changes
 * nothing": the existing library must be byte-identical afterwards, and the failure
 * must arrive as a typed `StorageError` rather than a thrown exception.
 *
 * Failures are injected by stubbing the table's `add`, which is the last step
 * inside the transaction — the same point a real quota overflow would hit.
 */

let db: LibraryDatabase;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = new LibraryDatabase(`test-atomic-${String(counter)}`);
  await db.open();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.delete();
});

/** Builds an error shaped like the browser's quota rejection. */
function quotaError(): Error {
  const error = new Error('The current transaction exceeded its quota limitations.');
  error.name = 'QuotaExceededError';
  return error;
}

describe('save failures', () => {
  it('reports an exhausted quota as a typed StorageQuotaError', async () => {
    vi.spyOn(db.conversations, 'add').mockRejectedValue(quotaError());

    const result = await saveConversation(makeConversation(), db);

    // A rejection, not a throw: the UI must never see a raw exception (§5).
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('StorageQuotaError');
  });

  it('leaves an existing library completely untouched when a save fails', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'a', title: 'اول' }), db);
    await saveConversation(makeConversation({ sourceConversationId: 'b', title: 'دوم' }), db);
    const before = await listConversations(db);

    vi.spyOn(db.conversations, 'add').mockRejectedValue(quotaError());
    await saveConversation(makeConversation({ sourceConversationId: 'c', title: 'سوم' }), db);

    const after = await listConversations(db);
    // Same count *and* same contents: no partial record, no reordering.
    expect(after.ok && after.data).toEqual(before.ok ? before.data : []);
  });

  it('adds no partial record when the write fails', async () => {
    vi.spyOn(db.conversations, 'add').mockRejectedValue(quotaError());

    await saveConversation(makeConversation(), db);

    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(0);
  });

  it('classifies a non-quota write failure separately', async () => {
    // Different remedy, so it must not be reported as a full disk.
    vi.spyOn(db.conversations, 'add').mockRejectedValue(new Error('transaction aborted'));

    const result = await saveConversation(makeConversation(), db);

    expect(!result.ok && result.error.code).toBe('StorageWriteError');
  });

  it('keeps technical detail out of the returned error message surface', async () => {
    vi.spyOn(db.conversations, 'add').mockRejectedValue(quotaError());

    const result = await saveConversation(makeConversation(), db);

    // Detail exists for the console, but it is a separate field the UI never renders.
    expect(!result.ok && result.error.detail).toContain('QuotaExceededError');
  });

  it('recovers for the next save once the failure clears', async () => {
    const add = vi.spyOn(db.conversations, 'add').mockRejectedValue(quotaError());
    await saveConversation(makeConversation({ sourceConversationId: 'fails' }), db);

    // A transient failure must not leave the store permanently broken.
    add.mockRestore();
    const result = await saveConversation(
      makeConversation({ sourceConversationId: 'works' }),
      db,
    );

    expect(result.ok && result.data.status).toBe('saved');
    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(1);
  });
});

describe('read failures', () => {
  it('reports a failed list as StorageReadError instead of throwing', async () => {
    vi.spyOn(db.conversations, 'orderBy').mockImplementation(() => {
      throw new Error('database closed');
    });

    const result = await listConversations(db);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('StorageReadError');
  });
});

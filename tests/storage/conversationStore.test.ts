import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryDatabase, SCHEMA_VERSION } from '@/storage/db';
import {
  clearLibrary,
  countConversations,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from '@/storage/conversationStore';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * Storage layer in isolation (FR3): this suite talks to `conversationStore` only —
 * never to a component — and drives a real IndexedDB implementation through
 * `fake-indexeddb` (`code-standards.md` §6), so schema, indexes and transactions
 * are genuinely exercised rather than mocked away.
 */

let db: LibraryDatabase;
let counter = 0;

beforeEach(async () => {
  // A uniquely named database per test keeps them fully independent: a leftover
  // record from a previous test would silently look like a duplicate.
  counter += 1;
  db = new LibraryDatabase(`test-library-${String(counter)}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('conversationStore', () => {
  it('stores a conversation and reads it back unchanged', async () => {
    const conversation = makeConversation({ title: 'گفتگوی اول' });

    const saved = await saveConversation(conversation, db);
    expect(saved.ok && saved.data.status).toBe('saved');

    const loaded = await getConversation(
      saved.ok && saved.data.status === 'saved' ? saved.data.id : 0,
      db,
    );
    // Deep equality: normalization's output must survive the round trip verbatim.
    expect(loaded.ok && loaded.data).toEqual(conversation);
  });

  it('records the query-helper metadata alongside the conversation (FR1)', async () => {
    await saveConversation(makeConversation(), db);

    const record = await db.conversations.toCollection().first();
    expect(record?.platform).toBe('deepseek');
    expect(record?.sourceConversationId).toBe('conv-1');
    expect(typeof record?.importedAt).toBe('number');
  });

  it('preserves attachment and tool-activity messages exactly (ADR #7)', async () => {
    const conversation = makeConversation({
      messages: [
        makeMessage({
          kind: 'attachment',
          sourceFragmentType: 'FILE',
          attachments: [{ fileId: 'f1', fileName: 'notes.pdf', fileSize: 1024 }],
        }),
        makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'SEARCH',
          order: 1,
          toolActivity: { activityType: 'SEARCH', results: [{ url: 'https://example.test' }] },
        }),
      ],
    });

    const saved = await saveConversation(conversation, db);
    const id = saved.ok && saved.data.status === 'saved' ? saved.data.id : 0;

    const loaded = await getConversation(id, db);
    expect(loaded.ok && loaded.data).toEqual(conversation);
  });

  it('keeps absent optional fields absent rather than storing undefined', async () => {
    // No title/createdAt/updatedAt: `'title' in conversation` must stay false, which
    // `exactOptionalPropertyTypes` promises callers (`types/conversation.ts`).
    await saveConversation(makeConversation(), db);

    const record = await db.conversations.toCollection().first();
    expect(record?.conversation).not.toHaveProperty('title');
    expect(record?.conversation).not.toHaveProperty('createdAt');
  });

  it('lists conversations newest import first', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'a', title: 'اول' }), db);
    await saveConversation(makeConversation({ sourceConversationId: 'b', title: 'دوم' }), db);
    await saveConversation(makeConversation({ sourceConversationId: 'c', title: 'سوم' }), db);

    const listed = await listConversations(db);
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    // `importedAt` descending, the Sidebar's documented order.
    expect(listed.data.map((entry) => entry.title)).toEqual(['سوم', 'دوم', 'اول']);
  });

  it('summarises each entry for the sidebar without returning message bodies', async () => {
    await saveConversation(
      makeConversation({ title: 'با پیام', messages: [makeMessage(), makeMessage({ order: 1 })] }),
      db,
    );

    const listed = await listConversations(db);
    const entry = listed.ok ? listed.data[0] : undefined;
    expect(entry?.messageCount).toBe(2);
    // A list row must not carry the conversation payload.
    expect(entry).not.toHaveProperty('messages');
    expect(entry).not.toHaveProperty('conversation');
  });

  it('omits the title for an untitled conversation instead of inventing one', async () => {
    await saveConversation(makeConversation(), db);

    const listed = await listConversations(db);
    // The fallback label is a UI decision, so storage must not supply it.
    expect(listed.ok && listed.data[0]).not.toHaveProperty('title');
  });

  it('deletes a conversation completely', async () => {
    const saved = await saveConversation(makeConversation(), db);
    const id = saved.ok && saved.data.status === 'saved' ? saved.data.id : 0;

    const deleted = await deleteConversation(id, db);
    expect(deleted.ok).toBe(true);

    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(0);
    const loaded = await getConversation(id, db);
    expect(loaded.ok && loaded.data).toBeUndefined();
  });

  it('treats a missing id as an empty read, not a failure', async () => {
    const loaded = await getConversation(999, db);

    // Another tab may legitimately have removed it — that is not an error.
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && loaded.data).toBeUndefined();
  });

  it('survives closing and reopening the database (NFR4)', async () => {
    const name = db.name;
    await saveConversation(makeConversation({ title: 'ماندگار' }), db);
    db.close();

    // A fresh connection to the same database models a page reload.
    const reopened = new LibraryDatabase(name);
    await reopened.open();
    const listed = await listConversations(reopened);

    expect(listed.ok && listed.data[0]?.title).toBe('ماندگار');
    reopened.close();
  });

  it('rejects an object that is not a usable conversation before writing', async () => {
    // Cast is the point of the test: a malformed record must be refused at runtime,
    // not merely at compile time.
    const result = await saveConversation({ sourceProvider: 'deepseek' } as never, db);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('InvalidConversationError');
    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(0);
  });

  it('declares schema version 1', () => {
    expect(db.verno).toBe(SCHEMA_VERSION);
  });
});

describe('clearLibrary', () => {
  it('empties a populated library completely (ADR #14)', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'a' }), db);
    await saveConversation(makeConversation({ sourceConversationId: 'b' }), db);

    const cleared = await clearLibrary(db);

    expect(cleared.ok).toBe(true);
    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(0);
    expect(await db.conversations.toArray()).toEqual([]);
  });

  it('succeeds as a no-op on an already-empty library', async () => {
    const cleared = await clearLibrary(db);

    // A second click on the bulk action must not fail just because there is
    // nothing left to remove.
    expect(cleared.ok).toBe(true);
  });

  it('surfaces a failure instead of throwing, leaving the library readable', async () => {
    await saveConversation(makeConversation(), db);
    vi.spyOn(db.conversations, 'clear').mockRejectedValue(new Error('blocked'));

    const cleared = await clearLibrary(db);

    expect(!cleared.ok && cleared.error.code).toBe('StorageDeleteError');
    // The atomicity promise: a failed clear changes nothing, so the records are
    // still exactly where they were.
    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(1);
  });
});

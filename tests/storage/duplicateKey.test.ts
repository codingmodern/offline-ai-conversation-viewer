import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryDatabase } from '@/storage/db';
import { buildDuplicateKey, findDuplicate } from '@/storage/duplicateKey';
import { countConversations, saveConversation } from '@/storage/conversationStore';
import { makeConversation } from '../fixtures/conversations';

/**
 * Duplicate detection (FR8 / ADR #9) and its consumer policy (ADR #13).
 *
 * The imports at the top of this file are the structural claim FR8 makes: the
 * algorithm is reachable through `storage/` alone — no component, hook or feature
 * module is involved — so replacing the rule later touches only `duplicateKey.ts`.
 */

let db: LibraryDatabase;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = new LibraryDatabase(`test-duplicates-${String(counter)}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('buildDuplicateKey', () => {
  it('derives the key from the provider and the source conversation id', () => {
    const key = buildDuplicateKey(makeConversation({ sourceConversationId: 'abc' }));

    expect(key).toEqual({ platform: 'deepseek', sourceConversationId: 'abc' });
  });

  it('ignores fields the user could change between two exports of one conversation', () => {
    const first = makeConversation({ sourceConversationId: 'abc', title: 'عنوان اول' });
    const second = makeConversation({ sourceConversationId: 'abc', title: 'عنوان دوم' });

    // A retitled or re-downloaded export is still the same conversation.
    expect(buildDuplicateKey(first)).toEqual(buildDuplicateKey(second));
  });
});

describe('findDuplicate', () => {
  it('finds a stored conversation with the same provider and id', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'abc' }), db);

    const found = await findDuplicate(
      db.conversations,
      makeConversation({ sourceConversationId: 'abc' }),
    );

    expect(found?.sourceConversationId).toBe('abc');
  });

  it('does not match a different conversation id', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'abc' }), db);

    const found = await findDuplicate(
      db.conversations,
      makeConversation({ sourceConversationId: 'xyz' }),
    );

    expect(found).toBeUndefined();
  });

  it('requires the platform to match as well as the id', async () => {
    await saveConversation(makeConversation({ sourceConversationId: 'shared' }), db);

    // Same id, different platform: provider ids are only unique within a platform,
    // so this must NOT be treated as a duplicate. Cast because `ProviderId`
    // currently has one member — the rule must hold as platforms are added.
    const other = {
      ...makeConversation({ sourceConversationId: 'shared' }),
      sourceProvider: 'chatgpt' as never,
    };
    const found = await findDuplicate(db.conversations, other);

    expect(found).toBeUndefined();
  });
});

describe('saveConversation duplicate handling', () => {
  it('reports a duplicate without writing anything (FR8/ADR #13)', async () => {
    await saveConversation(makeConversation({ title: 'اصل' }), db);

    const second = await saveConversation(makeConversation({ title: 'تکراری' }), db);

    expect(second.ok && second.data.status).toBe('duplicate');
    // Nothing added — and since ADR #13 there is deliberately no override that
    // could add one: a duplicate is skipped and summarized, never stored.
    const count = await countConversations(db);
    expect(count.ok && count.data).toBe(1);
  });

  it('reports the duplicate even when only the title changed', async () => {
    await saveConversation(makeConversation({ title: 'گفتگوی اصلی' }), db);

    const second = await saveConversation(makeConversation({ title: 'عنوان متفاوت' }), db);

    expect(second.ok && second.data.status).toBe('duplicate');
    expect(await countConversations(db)).toEqual(expect.objectContaining({ ok: true }));
  });
});

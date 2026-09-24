import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importToLibrary } from '@/features/library/importToLibrary';
import { countConversations } from '@/storage/conversationStore';
import { db } from '@/storage/db';
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
import { makeConversation } from '../fixtures/conversations';

/**
 * The Unit 03 → Unit 04 bridge under ADR #13's silent-skip policy: duplicates are
 * counted for the summary and never written — no dialog, no "Add anyway" path.
 */

beforeEach(async () => {
  await db.conversations.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.conversations.clear();
});

describe('importToLibrary', () => {
  it('stores every conversation in a multi-conversation export', async () => {
    const result = await importToLibrary([
      makeConversation({ sourceConversationId: 'a' }),
      makeConversation({ sourceConversationId: 'b' }),
      makeConversation({ sourceConversationId: 'c' }),
    ]);

    expect(result.savedIds).toHaveLength(3);
    expect(result.skippedDuplicates).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('skips a duplicate without writing it and without any question (ADR #13)', async () => {
    await importToLibrary([makeConversation({ sourceConversationId: 'a', title: 'اصل' })]);

    const second = await importToLibrary([
      makeConversation({ sourceConversationId: 'a', title: 'دوباره' }),
    ]);

    expect(second.savedIds).toHaveLength(0);
    // The skip is *reported*, keyed over FR8's natural key…
    expect(second.skippedDuplicates.map((skip) => skip.key)).toEqual(['deepseek:a']);
    // …but never added: the count is unchanged.
    const count = await countConversations();
    expect(count.ok && count.data).toBe(1);
  });

  it('reports the duplicate even when only the title changed', async () => {
    await importToLibrary([makeConversation({ sourceConversationId: 'a', title: 'قبلی' })]);

    const second = await importToLibrary([
      makeConversation({ sourceConversationId: 'a', title: 'عنوان تازه' }),
    ]);

    // A retitled export is still the same conversation (ADR #9's key ignores titles).
    expect(second.skippedDuplicates).toHaveLength(1);
    expect(second.savedIds).toHaveLength(0);
  });

  it('gives each skipped duplicate a stable, distinct key', async () => {
    await importToLibrary([
      makeConversation({ sourceConversationId: 'a' }),
      makeConversation({ sourceConversationId: 'b' }),
    ]);

    const second = await importToLibrary([
      makeConversation({ sourceConversationId: 'a' }),
      makeConversation({ sourceConversationId: 'b' }),
    ]);

    const keys = second.skippedDuplicates.map((duplicate) => duplicate.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('treats a repeat inside one file as a duplicate of the first occurrence', async () => {
    // Sequential saving is what makes this work without a special case.
    const result = await importToLibrary([
      makeConversation({ sourceConversationId: 'same' }),
      makeConversation({ sourceConversationId: 'same' }),
    ]);

    expect(result.savedIds).toHaveLength(1);
    expect(result.skippedDuplicates).toHaveLength(1);
  });

  it('saves only the new conversations of a mixed batch and skips the duplicates', async () => {
    await importToLibrary([
      makeConversation({ sourceConversationId: 'old-1' }),
      makeConversation({ sourceConversationId: 'old-2' }),
    ]);

    const mixed = await importToLibrary([
      makeConversation({ sourceConversationId: 'old-1' }), // already stored → skipped
      makeConversation({ sourceConversationId: 'new-1' }), // saved
      makeConversation({ sourceConversationId: 'old-2' }), // already stored → skipped
      makeConversation({ sourceConversationId: 'new-2' }), // saved
    ]);

    expect(mixed.savedIds).toHaveLength(2);
    expect(mixed.skippedDuplicates).toHaveLength(2);
    const count = await countConversations();
    expect(count.ok && count.data).toBe(4);
  });

  it('keeps importing the remaining conversations after one fails', async () => {
    const conversations = [
      makeConversation({ sourceConversationId: 'ok-1' }),
      // Invalid on purpose: it must not abort the batch.
      { sourceProvider: 'deepseek' } as never,
      makeConversation({ sourceConversationId: 'ok-2' }),
    ];

    const result = await importToLibrary(conversations);

    expect(result.savedIds).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
  });

  it('reports an empty batch as an empty result rather than failing', async () => {
    const result = await importToLibrary([]);

    expect(result).toEqual({ savedIds: [], skippedDuplicates: [], failures: [] });
  });
});

import { describe, expect, it } from 'vitest';
import type { SearchIndexEntry } from '@/types/storage';
import { findMatches } from '@/features/search/searchConversations';
import { buildSearchableText } from '@/storage/searchableText';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * The pure matcher: substring containment over pre-folded index text.
 *
 * The library built for these tests mirrors what
 * `subscribeToSearchIndex` projects from real stored records — same builder,
 * same shapes — so the pair (builder + matcher) is exercised exactly as they run
 * in production.
 */

function entry(
  conversationId: number,
  conversation: Parameters<typeof buildSearchableText>[0],
): SearchIndexEntry {
  return {
    conversationId,
    ...(conversation.title === undefined ? {} : { title: conversation.title }),
    searchableText: buildSearchableText(conversation),
  };
}

const index: readonly SearchIndexEntry[] = [
  entry(1, makeConversation({ title: 'برنامه‌ریزی سفر شمال' })),
  entry(
    2,
    makeConversation({
      title: 'کاملا نامرتبط',
      messages: [makeMessage({ content: 'خروجی پروژه را با Node.js بیلد کن' })],
    }),
  ),
  entry(
    3,
    makeConversation({
      messages: [
        makeMessage({
          kind: 'attachment',
          sourceFragmentType: 'FILE',
          attachments: [{ fileId: 'f', fileName: 'resume.pdf', fileSize: 100 }],
        }),
      ],
    }),
  ),
];

describe('findMatches', () => {
  it('matches on title only (spec Edge Case: hit without any matching message)', () => {
    expect(findMatches(index, 'سفر شمال')).toEqual([1]);
  });

  it('matches inside message content when the title never mentions it', () => {
    expect(findMatches(index, 'node.js')).toEqual([2]);
  });

  it('is case-insensitive against pre-folded index text', () => {
    expect(findMatches(index, 'NODE.JS')).toEqual([2]);
  });

  it('reaches conversations through an attachment file name', () => {
    expect(findMatches(index, 'resume.pdf')).toEqual([3]);
  });

  it('lists every conversation the term appears in (Edge Case: multi-match)', () => {
    const both: readonly SearchIndexEntry[] = [
      entry(10, makeConversation({ title: 'elasticsearch setup' })),
      entry(
        11,
        makeConversation({ messages: [makeMessage({ content: 'we use elasticsearch daily' })] }),
      ),
    ];

    expect(findMatches(both, 'elasticsearch')).toEqual([10, 11]);
  });

  it('returns nothing for a term no record contains (valid state, FR8)', () => {
    expect(findMatches(index, 'quantum')).toEqual([]);
  });

  it('treats an empty needle as «no active search» rather than match-everything', () => {
    expect(findMatches(index, '')).toEqual([]);
  });

  it('searches regex metacharacters literally instead of interpreting them', () => {
    const tricky: readonly SearchIndexEntry[] = [
      entry(7, makeConversation({ messages: [makeMessage({ content: 'a.c (star*) value+1' })] })),
    ];

    expect(findMatches(tricky, 'a.c')).toEqual([7]);
    expect(findMatches(tricky, 'abc')).toEqual([]);
    expect(findMatches(tricky, '(star*)')).toEqual([7]);
  });

  it('matches Persian queries verbatim, including Persian-digit terms', () => {
    const persian: readonly SearchIndexEntry[] = [
      entry(
        21,
        makeConversation({
          messages: [makeMessage({ content: 'پرداخت در سال ۱۴۰۳ انجام شد' })],
        }),
      ),
    ];

    expect(findMatches(persian, '۱۴۰۳')).toEqual([21]);
    expect(findMatches(persian, 'پرداخت در سال')).toEqual([21]);
    expect(findMatches(persian, '1403')).toEqual([]);

    /*
     * Documented v1 limitation (ADR #19): matching is verbatim after ASCII-style
     * case-folding only. No NFC/ZWNJ/character-class normalisation yet, so
     * Arabic-script look-alikes do NOT cross-match («ي/ك» vs «ی/ک», hard vs
     * soft variants) — the same pitfall family as `\d` vs `[۰-۹]` learned in
     * Unit 05. A query typed the way the text was written always matches.
     */
    const yehVariant: readonly SearchIndexEntry[] = [
      entry(22, makeConversation({ messages: [makeMessage({ content: 'كارت بانکی' })] })),
    ];
    expect(findMatches(yehVariant, 'كارت')).toEqual([22]);
    expect(findMatches(yehVariant, 'کارت')).toEqual([]);
  });

  it('a single search stays well inside NFR1 (300 ms) on a corpus many times the reference size', () => {
    // ~133 real-world conversations × long threads would be ~2 MB; generating
    // 266 synthetic conversations of 200 long messages gives ~8 MB — well above
    // today's corpus — so the assertion measures headroom, not a tuned tightrope.
    const big: SearchIndexEntry[] = [];
    for (let i = 0; i < 266; i += 1) {
      big.push(
        entry(
          i,
          makeConversation({
            title: `گفتگوی شماره ${i}`,
            messages: Array.from({ length: 200 }, (_, m) =>
              makeMessage({
                order: m,
                content: `پیام شماره ${m} با متن نسبتاً بلند درباره‌ی موضوعات روزمره و فنی پروژه؛ `.repeat(4),
              }),
            ),
          }),
        ),
      );
    }

    // Warm once so JIT / V8 has settled before the timed pass.
    findMatches(big, 'شماره 132');

    const startedAt = performance.now();
    findMatches(big, 'شماره 132');
    const elapsedMs = performance.now() - startedAt;

    // The NFR is per-keystroke, and every keystroke costs one such pass.
    expect(elapsedMs).toBeLessThan(300);
    // Correctness survives scale too.
    expect(findMatches(big, 'موضوعات روزمره')).toHaveLength(266);
  });
});

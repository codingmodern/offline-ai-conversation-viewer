import { describe, expect, it } from 'vitest';
import { buildSearchableText } from '@/storage/searchableText';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * The searchable-content rules Unit 07 was approved with:
 *   - `kind: 'text'` content → searchable (ADR #7's REQUEST/RESPONSE/THINK),
 *   - attachment `fileName` → searchable,
 *   - `tool_activity` payloads → **never** touched (ADR #18: undocumented shape).
 *
 * These tests pin that contract so a later refactor cannot silently start
 * searching undocumented data or silently drop filenames.
 */

describe('buildSearchableText', () => {
  it('includes text-message content', () => {
    const text = buildSearchableText(
      makeConversation({
        messages: [makeMessage({ content: 'قیمت ارز دیروز چقدر بود؟' })],
      }),
    );

    expect(text).toContain('قیمت ارز دیروز چقدر بود؟');
  });

  it('includes attachment file names but not their other fields', () => {
    const text = buildSearchableText(
      makeConversation({
        messages: [
          makeMessage({
            kind: 'attachment',
            sourceFragmentType: 'FILE',
            attachments: [{ fileId: 'f-991', fileName: 'گزارش-فروش.xlsx', fileSize: 2048 }],
          }),
        ],
      }),
    );

    // The name a user would remember is searchable…
    expect(text).toContain('گزارش-فروش.xlsx');
    // …while internal ids/sizes stay out: they are not what anyone searches by.
    expect(text).not.toContain('f-991');
    expect(text).not.toContain('2048');
  });

  it('never reads tool_activity results into the index (ADR #18)', () => {
    const text = buildSearchableText(
      makeConversation({
        messages: [
          makeMessage({
            role: 'assistant',
            kind: 'tool_activity',
            sourceFragmentType: 'SEARCH',
            order: 0,
            toolActivity: {
              activityType: 'SEARCH',
              results: [{ title: 'جستجوی مخفی', url: 'https://example.test' }],
            },
          }),
        ],
      }),
    );

    expect(text).toBe('');
  });

  it('joins pieces with newlines so separate fields cannot fuse into false hits', () => {
    const text = buildSearchableText(
      makeConversation({
        title: 'اب',
        messages: [
          makeMessage({ content: 'چه خبر' }),
          makeMessage({
            kind: 'attachment',
            sourceFragmentType: 'FILE',
            order: 1,
            attachments: [{ fileId: 'f', fileName: 'notes.txt', fileSize: 1 }],
          }),
        ],
      }),
    );

    expect(text).toBe('اب\nچه خبر\nnotes.txt');
  });

  it('case-folds Latin text once, here at build time', () => {
    const text = buildSearchableText(
      makeConversation({ messages: [makeMessage({ content: 'DeepSeek API Rate Limits' })] }),
    );

    expect(text).toBe('deepseek api rate limits');
  });

  it('handles an empty conversation and one without a title', () => {
    expect(buildSearchableText(makeConversation({ messages: [] }))).toBe('');
    expect(buildSearchableText(makeConversation())).toBe('سلام');
  });
});

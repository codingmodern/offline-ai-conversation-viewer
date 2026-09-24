import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/gemini/parse';
import { normalizeGemini } from '@/normalization/gemini';
import { buildSearchableText } from '@/storage/searchableText';
import type { UnifiedConversation } from '@/types/conversation';
import sampleExport from '../fixtures/gemini/sample-export.json';

/**
 * End-to-end over the synthetic fixture: `parse()` → `normalizeGemini()`.
 *
 * The unit suites cover each layer in isolation; these cases prove the two
 * layers agree on a whole file — the reverse-chronological Activity array ends
 * up as ascending conversations of ascending turns, and nothing is dropped.
 * Synthetic only — the real export stays local
 * (`context/fixtures/gemini/README.md`), so the committed suite is reproducible
 * on any machine; AC1's 23-items/7-conversations figure was verified against
 * that real file during the unit's acceptance run.
 */
function normalizeFixture(fixture: unknown): readonly UnifiedConversation[] {
  const parsed = parse(fixture);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code} — ${parsed.error.detail ?? ''}`);
  }
  return normalizeGemini(parsed.data);
}

describe('gemini fixture → unified model', () => {
  it('imports the whole file: 6 Activity items become 4 conversations / 14 messages', () => {
    const conversations = normalizeFixture(sampleExport);

    expect(conversations).toHaveLength(4);
    expect(conversations.map((conversation) => conversation.messages.length)).toEqual([
      4, // conv-b: 2 turns, the second one dual-draft
      6, // conv-c: 2 turns, each with a file placeholder
      2, // conv-d: 1 turn
      2, // conv-a: 1 turn
    ]);
  });

  it('orders conversations and turns ascending, though the file is descending (AC2)', () => {
    const conversations = normalizeFixture(sampleExport);

    for (const conversation of conversations) {
      const times = conversation.messages
        .map((message) => message.createdAt)
        .filter((time): time is string => time !== undefined)
        .map((time) => Date.parse(time));
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    }
    const firstTurns = conversations.map((conversation) => conversation.createdAt);
    const firstTurnMs = (firstTurns.filter((t) => t !== undefined) as string[]).map((t) => Date.parse(t));
    expect(firstTurnMs).toEqual([...firstTurnMs].sort((a, b) => a - b));
  });

  it('carries both drafts of the dual-draft turn on one assistant message (AC3, ADR #25)', () => {
    const [conversation] = normalizeFixture(sampleExport);
    if (conversation === undefined) throw new Error('fixture must normalize');

    const answer = conversation.messages.find(
      (message) => message.role === 'assistant' && message.alternatives !== undefined,
    );

    expect(answer?.alternatives).toHaveLength(1);
    expect(answer?.content).toContain('هر دو پیش‌نویس');
  });

  it('searches user text, the derived title and attachment names', () => {
    const conversations = normalizeFixture(sampleExport);
    const convA = conversations.find(
      (item) => item.sourceConversationId === 'sample-conv-a',
    );
    const convC = conversations.find(
      (item) => item.sourceConversationId === 'sample-conv-c',
    );
    if (convA === undefined || convC === undefined) {
      throw new Error('fixture must normalize to the sample conversations');
    }

    // Finding a conversation by remembering its first sentence, or the name of
    // a file that was attached to it, is exactly the value search exists for.
    expect(buildSearchableText(convA)).toContain('hello there');
    expect(buildSearchableText(convC)).toContain('shot-01.jpg');
    expect(buildSearchableText(convC)).toContain('این تصویر را بررسی کن');
    // Nothing was invented: no placeholder text, no fabricated title.
    expect(buildSearchableText(convA)).not.toContain('فایل بی‌نام');
    expect(buildSearchableText(convA)).not.toContain('گفتگوی بی‌عنوان');
    // Documented consequence of keeping the answer verbatim (FR7): the
    // assistant side is searchable as the raw HTML the export carries, markup
    // included — the search layer reads the shared model and is deliberately
    // provider-agnostic.
    expect(buildSearchableText(convC)).toContain('<p>تصویر ساخته شد.</p>');
  });
});
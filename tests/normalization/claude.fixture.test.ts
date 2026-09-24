import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/claude/parse';
import { normalizeClaude } from '@/normalization/claude';
import { buildSearchableText } from '@/storage/searchableText';
import type { UnifiedConversation } from '@/types/conversation';
import sampleExport from '../fixtures/claude/sample-export.json';

/**
 * End-to-end over the synthetic fixture: `parse()` → `normalizeClaude()`.
 *
 * The unit suites cover each layer in isolation; these cases prove the two
 * layers agree on a whole file. Synthetic only — the real export stays local
 * (`context/fixtures/claude/README.md`).
 */
function normalizeFixture(fixture: unknown): readonly UnifiedConversation[] {
  const parsed = parse(fixture);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code} — ${parsed.error.detail ?? ''}`);
  }
  return normalizeClaude(parsed.data);
}

describe('claude fixture → unified model', () => {
  it('imports the whole file without dropping the live line or its fragments', () => {
    const conversations = normalizeFixture(sampleExport);

    expect(conversations).toHaveLength(2);
    expect(conversations[0]?.messages).toHaveLength(8);
    expect(conversations[1]?.messages).toHaveLength(3);
  });

  it('excludes the stale regenerate branch from the unified model (ADR #22)', () => {
    const [conversation] = normalizeFixture(sampleExport);
    const contents = conversation?.messages
      .filter((message) => message.kind === 'text')
      .map((message) => message.content);

    // The stale branch's «پاسخ نسخه‌ی قدیمی» must not appear anywhere.
    expect(contents).not.toContain('پاسخ نسخه‌ی قدیمی');
    expect(contents).toContain('پاسخ نهایی با **تأکید**.');
  });

  it('carries the tool pair so the theme can link them by toolUseId', () => {
    const [conversation] = normalizeFixture(sampleExport);
    const uses = conversation?.messages
      .filter((message) => message.toolActivity?.activityType === 'tool_use')
      .map((message) => message.toolActivity?.toolUseId);
    const results = conversation?.messages
      .filter((message) => message.toolActivity?.activityType === 'tool_result')
      .map((message) => message.toolActivity?.toolUseId);

    expect(uses).toEqual(['toolu_001']);
    expect(results).toEqual(['toolu_001']);
  });

  it('keeps the searchable text free of tool payloads (ADR #18)', () => {
    const [conversation] = normalizeFixture(sampleExport);
    if (conversation === undefined) throw new Error('fixture must normalize');

    // The unified model preserves tool payloads verbatim (they are display
    // data for the theme), so the right contract is on the *search haystack*:
    // `buildSearchableText` never reads tool_activity payloads (ADR #18).
    const haystack = buildSearchableText(conversation as UnifiedConversation);

    expect(haystack).not.toContain('آفتابی است');
    expect(haystack).not.toContain('وضعیت هوا');
    // Real content and the title are searchable.
    expect(haystack).toContain('پاسخ نهایی');
    expect(haystack).toContain('گفتگوی نمونه');
  });
});

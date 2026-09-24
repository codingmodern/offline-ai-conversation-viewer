import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/chatgpt/parse';
import { normalizeChatGpt } from '@/normalization/chatgpt';
import { detectProvider } from '@/detection/detectProvider';
import { parseConversations } from '@/parsers/parseConversations';
import { buildSearchableText } from '@/storage/searchableText';
import type { UnifiedConversation, UnifiedToolActivity } from '@/types/conversation';
import minimal from '../fixtures/chatgpt/minimal.json';
import structure from '../fixtures/chatgpt/structure.json';
import branching from '../fixtures/chatgpt/branching.json';
import contentTypes from '../fixtures/chatgpt/content-types.json';
import citations from '../fixtures/chatgpt/citations.json';
import persian from '../fixtures/chatgpt/persian.json';
import hostile from '../fixtures/chatgpt/hostile.json';
import shardA from '../fixtures/chatgpt/shards/conversations-000.json';
import shardB from '../fixtures/chatgpt/shards/conversations-001.json';
import manifest from '../fixtures/chatgpt/shards/not-a-conversation.json';

/**
 * End-to-end over the synthetic fixtures: `parse()` → `normalizeChatGpt()`.
 *
 * The unit suites cover each layer in isolation; these cases prove the two
 * layers agree on whole files — the fixtures' names mirror the spec's §7 list
 * and each block below pins one Acceptance Criterion. Everything here is
 * synthetic and ChatGPT stays **Unverified** until a real export passes the same
 * suite (`context/fixtures/chatgpt/README.md`).
 */
function normalizeFixture(fixture: unknown): readonly UnifiedConversation[] {
  const parsed = parse(fixture);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code} — ${parsed.error.detail ?? ''}`);
  }
  return normalizeChatGpt(parsed.data);
}

/** The projection used to pin FR-6's map without snapshotting every payload. */
function projection(conversation: UnifiedConversation): Array<[string, string, string]> {
  return conversation.messages.map((message) => [
    message.sourceFragmentType,
    message.kind,
    message.role,
  ]);
}

/** `storage/`'s boundary check, re-declared here to keep this suite Dexie-free. */
function isStorableShape(conversation: UnifiedConversation): boolean {
  return (
    typeof conversation.sourceProvider === 'string' &&
    conversation.sourceProvider.length > 0 &&
    typeof conversation.sourceConversationId === 'string' &&
    conversation.sourceConversationId.length > 0 &&
    Array.isArray(conversation.messages)
  );
}

describe('chatgpt fixture — minimal (AC1, pipeline level)', () => {
  it('detects and imports the owner-supplied sample unchanged', () => {
    expect(detectProvider(minimal as unknown)).toEqual({ ok: true, data: 'chatgpt' });

    const conversations = normalizeFixture(minimal);
    expect(conversations).toHaveLength(1);

    const [conversation] = conversations;
    expect(conversation?.sourceProvider).toBe('chatgpt');
    expect(conversation?.sourceConversationId).toBe('conversation-uuid');
    expect(conversation?.title).toBe('عنوان گفتگو');
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    // Persian text survives byte-for-byte (AC1).
    expect(conversation?.messages.map((message) => message.content)).toEqual([
      'سلام',
      'سلام! چطور می‌توانم کمک کنم؟',
      'ساختار conversations.json چیست؟',
    ]);
    // ADR-I: the export's Unix seconds became exactly one ISO string each.
    expect(conversation?.messages[0]?.createdAt).toBe(new Date(1750000000123).toISOString());
    expect(conversation?.createdAt).toBe(new Date(1750000000123).toISOString());
    expect(conversation?.updatedAt).toBe(new Date(1750000100456).toISOString());
  });

  it('is storable and searchable through the shared library path', () => {
    const [conversation] = normalizeFixture(minimal);
    if (conversation === undefined) throw new Error('fixture must normalize');

    expect(isStorableShape(conversation)).toBe(true);
    // Search reads only the shared model (ADR #19): title + text contents.
    expect(buildSearchableText(conversation)).toContain('سلام');
    expect(buildSearchableText(conversation)).toContain('عنوان گفتگو');
  });
});

describe('chatgpt fixture — structure (AC2, AC10)', () => {
  it('shows no system, hidden, weight-0 or context message, and raises no error', () => {
    const [conversation] = normalizeFixture(structure);

    expect(conversation?.messages.map((message) => message.content)).toEqual([
      'سلام',
      'سلام! چطور کمکی کنم؟',
      'پاسخ دوم',
    ]);
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
  });

  it('survives null times: nothing is invented, and what exists still sorts', () => {
    const [conversation] = normalizeFixture(structure);

    // The export's own conversation-level times are null → absent, never faked.
    expect(conversation).not.toHaveProperty('createdAt');
    expect(conversation).not.toHaveProperty('updatedAt');
    // The two null-timed messages inherited their ancestor's time (FR-9), the
    // third carried its own; all of them parse as real instants.
    const times = (conversation?.messages ?? [])
      .map((message) => message.createdAt)
      .filter((time): time is string => time !== undefined)
      .map((time) => Date.parse(time));
    expect(times).toHaveLength(3);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('chatgpt fixture — branching (AC3)', () => {
  it('shows the current_node path: neither the first nor the last child', () => {
    const active = normalizeFixture(branching).find(
      (entry) => entry.sourceConversationId === 'branch-conv',
    );
    if (active === undefined) throw new Error('fixture must normalize to branch-conv');

    expect(active.messages.map((message) => message.content)).toEqual([
      'سؤال اصلی',
      'شاخه‌ی فعال',
      'ادامه‌ی شاخه‌ی فعال',
    ]);
    // The dead regenerate/edit branches stay out of the v1 thread (ADR-B).
    expect(active.messages.map((message) => message.content)).not.toContain('شاخه‌ی اول');
    expect(active.messages.map((message) => message.content)).not.toContain('شاخه‌ی آخر');
  });

  it('with current_node removed, the thread equals the last-child path', () => {
    const [conversation] = (branching as Array<Record<string, unknown>>).filter(
      (entry) => entry.id === 'branch-conv',
    );
    const withoutCurrent: Record<string, unknown> = { ...conversation };
    delete withoutCurrent.current_node;

    const [active] = normalizeFixture([withoutCurrent]);

    expect(active?.messages.map((message) => message.content)).toEqual([
      'سؤال اصلی',
      'شاخه‌ی آخر',
    ]);
  });

  it('falls back to the last-child path for a conversation with no current_node', () => {
    const fallback = normalizeFixture(branching).find(
      (entry) => entry.sourceConversationId === 'branch-fallback',
    );
    if (fallback === undefined) throw new Error('fixture must normalize to branch-fallback');

    expect(fallback.messages.map((message) => message.content)).toEqual(['پرسش', 'آخرین شاخه']);
  });
});

describe('chatgpt fixture — content types (AC4, AC5)', () => {
  it('maps every content type to its FR-6 category', () => {
    const [conversation] = normalizeFixture(contentTypes);
    if (conversation === undefined) throw new Error('fixture must normalize');

    expect(projection(conversation)).toEqual([
      ['text', 'text', 'user'], // u1
      ['multimodal_text', 'text', 'assistant'], // m1: the string part
      ['image_asset_pointer', 'attachment', 'assistant'], // m1: the pointer part
      ['code', 'tool_activity', 'assistant'], // t1
      ['execution_output', 'tool_activity', 'assistant'], // t2 (tool role → assistant)
      ['computer_output', 'tool_activity', 'assistant'], // t3
      ['thoughts', 'text', 'assistant'], // r1
      ['reasoning_recap', 'text', 'assistant'], // r2
      ['tether_browsing_display', 'tool_activity', 'assistant'], // t4
      ['commentary', 'text', 'assistant'], // cm (channel = commentary)
      ['text', 'text', 'user'], // u4: the string part
      ['attachments', 'attachment', 'user'], // u4: metadata attachments
      ['super_widget', 'text', 'assistant'], // sw: unknown-type placeholder
      ['mystery_card', 'text', 'assistant'], // un: unknown-type placeholder
      ['text', 'tool_activity', 'assistant'], // tt: assistant → dalle
      ['text', 'text', 'user'], // u5
    ]);
  });

  it('carries the tool payloads and names the tools it can name', () => {
    const [conversation] = normalizeFixture(contentTypes);
    if (conversation === undefined) throw new Error('fixture must normalize');
    const byType = (type: string): UnifiedToolActivity | undefined =>
      conversation.messages.find(
        (message) => message.kind === 'tool_activity' && message.sourceFragmentType === type,
      )?.toolActivity;

    expect(byType('code')).toMatchObject({ activityType: 'code', toolInput: 'print("hi")' });
    expect(byType('execution_output')).toMatchObject({
      activityType: 'execution_output',
      toolOutput: 'hi',
      toolName: 'python',
    });
    expect(byType('tether_browsing_display')).toMatchObject({ toolOutput: 'صفحه‌ی وب' });
    // The invocation addressed to a tool names it from the recipient.
    const addressed = conversation.messages.find(
      (message) => message.kind === 'tool_activity' && message.order === 14,
    );
    expect(addressed?.toolActivity).toMatchObject({
      activityType: 'text',
      toolName: 'dalle',
      toolInput: '{"prompt":"a cat"}',
    });
  });

  it('shows unknown types as self-naming placeholders, never as gaps (AC4/AC5)', () => {
    const [conversation] = normalizeFixture(contentTypes);
    if (conversation === undefined) throw new Error('fixture must normalize');
    const placeholders = conversation.messages.filter(
      (message) => message.sourceFragment !== undefined,
    );

    expect(placeholders.map((message) => message.sourceFragmentType)).toEqual([
      'super_widget',
      'mystery_card',
    ]);
    expect(placeholders.every((message) => message.content === undefined)).toBe(true);
    // AC5: the image became an attachment message with the real pointer id and
    // the shared placeholder name — never a broken image or an empty row.
    const pointer = conversation.messages.find(
      (message) => message.sourceFragmentType === 'image_asset_pointer',
    );
    expect(pointer?.attachments?.[0]).toEqual({
      fileId: 'file-service://file-abc',
      fileName: 'فایل پیوست',
    });
    // The metadata attachment kept the export's own name and size.
    const metadata = conversation.messages.find(
      (message) => message.sourceFragmentType === 'attachments',
    );
    expect(metadata?.attachments).toEqual([
      { fileId: 'file-1', fileName: 'resume.pdf', fileSize: 1234 },
    ]);
  });
});

describe('chatgpt fixture — citations (AC6, FR-7)', () => {
  it('leaves no marker character in any displayed text', () => {
    const [conversation] = normalizeFixture(citations);
    if (conversation === undefined) throw new Error('fixture must normalize');

    for (const message of conversation.messages) {
      if (message.content === undefined) {
        continue;
      }
      expect(message.content).not.toContain('\uE200');
      expect(message.content).not.toContain('\uE201');
      expect(message.content).not.toContain('【');
      expect(message.content).not.toContain('】');
    }
    // The visible text survived around the removed markers.
    const contents = conversation.messages.map((message) => message.content ?? '');
    expect(contents.join('\n')).toContain('متن اول');
    expect(contents.join('\n')).toContain('پایان');
    expect(contents.join('\n')).toContain('متن نهایی');
  });

  it('keeps a tool payload verbatim — cleanup is message text only', () => {
    const [conversation] = normalizeFixture(citations);
    if (conversation === undefined) throw new Error('fixture must normalize');
    const code = conversation.messages.find(
      (message) => message.sourceFragmentType === 'code',
    );

    expect(code?.toolActivity?.toolInput).toContain('\uE200');
  });
});

describe('chatgpt fixture — hostile (AC7)', () => {
  it('imports both valid conversations plus the cycle one, and skips the rest', () => {
    const conversations = normalizeFixture(hostile);

    expect(conversations.map((conversation) => conversation.sourceConversationId)).toEqual([
      'hostile-valid-1',
      'hostile-cycle',
      'hostile-valid-2',
    ]);

    // The no-mapping conversation is skipped and the reason is recorded (ADR-J);
    // the UI surface for it is a later sub-unit's concern.
    const parsed = parse(hostile as unknown);
    if (!parsed.ok) throw new Error('hostile must parse');
    expect(parsed.data.skipped).toEqual([{ id: 'hostile-no-mapping', reason: 'missing mapping' }]);
  });

  it('keeps the cycle conversation’s readable thread — nothing hangs or throws', () => {
    const cycle = normalizeFixture(hostile).find(
      (conversation) => conversation.sourceConversationId === 'hostile-cycle',
    );
    if (cycle === undefined) throw new Error('fixture must normalize to hostile-cycle');

    expect(cycle.messages.map((message) => message.content)).toEqual([
      'پیام اصلی',
      'پاسخ اصلی',
      'ویرایش',
      'شاخه‌ی حلقه‌ای',
      'زیرشاخه‌ی جدا',
    ]);
  });
});

describe('chatgpt fixture — persian', () => {
  it('preserves ZWNJ, mixed direction and fenced code exactly', () => {
    const [conversation] = normalizeFixture(persian);
    if (conversation === undefined) throw new Error('fixture must normalize');

    expect(conversation.messages.map((message) => message.content)).toEqual([
      'می‌شود و نمی‌شود — آزمون نیم‌فاصله و mixed English text در یک پیام',
      'پاسخ فارسی با کد:\n```python\nprint("سلام دنیا")\n```\nو پایان پاسخ.',
      'یک سؤال دیگر',
    ]);
    expect(buildSearchableText(conversation)).toContain('می‌شود');
  });
});

describe('chatgpt fixture — shards (AC8, pipeline level)', () => {
  it('imports both shard files independently through the existing pipeline', () => {
    for (const [fixture, expected] of [
      [shardA, 2],
      [shardB, 1],
    ] as const) {
      expect(detectProvider(fixture as unknown)).toEqual({ ok: true, data: 'chatgpt' });

      const result = parseConversations('chatgpt', fixture as unknown);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(expected);
      expect(result.data[0]?.sourceProvider).toBe('chatgpt');
    }
  });

  it('fails the extra JSON file alone with the existing unsupported-format error', () => {
    const detection = detectProvider(manifest as unknown);

    expect(detection.ok).toBe(false);
    if (!detection.ok) {
      expect(detection.error.code).toBe('UnsupportedFormatError');
    }
  });
});

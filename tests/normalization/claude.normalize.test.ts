import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/claude/parse';
import { normalizeClaude } from '@/normalization/claude';
import type { UnifiedConversation } from '@/types/conversation';
import sampleExport from '../fixtures/claude/sample-export.json';

/**
 * Claude's fragment → unified-message mapping, pinned against the synthetic
 * fixture (the real export stays local — `context/fixtures/claude/README.md`).
 */

function normalizeFixture(): readonly UnifiedConversation[] {
  const parsed = parse(sampleExport);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code}`);
  }
  return normalizeClaude(parsed.data);
}

function firstConversation(): UnifiedConversation {
  const [conversation] = normalizeFixture();
  if (conversation === undefined) {
    throw new Error('fixture must normalize to at least one conversation');
  }
  return conversation;
}

describe('normalizeClaude — conversation level', () => {
  it('maps the export metadata verbatim onto the unified model', () => {
    const conversation = firstConversation();

    expect(conversation.sourceProvider).toBe('claude');
    expect(conversation.sourceConversationId).toBe('conv-0001');
    expect(conversation.title).toBe('گفتگوی نمونه');
    expect(conversation.summary).toBe('خلاصه‌ای که خود پلتفرم ثبت کرده است.');
    expect(conversation.createdAt).toBe('2026-08-30T00:20:01.149417Z');
    expect(conversation.updatedAt).toBe('2026-08-30T00:23:03.506758Z');
  });

  it('produces sequential, gap-free order values', () => {
    const conversation = firstConversation();

    expect(conversation.messages.map((message) => message.order)).toEqual(
      conversation.messages.map((_, index) => index),
    );
  });
});

describe('normalizeClaude — one fragment is one message', () => {
  it('expands the live assistant turn into four messages', () => {
    const conversation = firstConversation();

    expect(
      conversation.messages.map((message) => [
        message.sourceFragmentType,
        message.kind,
        message.role,
      ]),
    ).toEqual([
      ['text', 'text', 'user'], // msg-0001
      ['thinking', 'text', 'assistant'], // msg-0003 fragments…
      ['tool_use', 'tool_activity', 'assistant'],
      ['tool_result', 'tool_activity', 'assistant'],
      ['text', 'text', 'assistant'],
      ['text', 'text', 'user'], // msg-0004 (empty content, text mirror)
      ['text', 'text', 'assistant'], // msg-0005
      ['files', 'attachment', 'assistant'], // its files trailing message
    ]);
  });

  it('keeps each fragment payload on its own message', () => {
    const conversation = firstConversation();
    const [, thinking, toolUse, toolResult, answer] = conversation.messages;

    expect(thinking).toMatchObject({
      kind: 'text',
      role: 'assistant',
      sourceFragmentType: 'thinking',
      content: 'ابتدا درخواست را بررسی می‌کنم.\nسپس پاسخ را می‌نویسم.',
      createdAt: '2026-08-30T00:21:00.000000Z',
    });
    expect(toolUse).toMatchObject({
      kind: 'tool_activity',
      toolActivity: {
        activityType: 'tool_use',
        toolUseId: 'toolu_001',
        toolName: 'web_search',
        toolInput: { query: 'وضعیت هوا' },
      },
    });
    expect(toolResult).toMatchObject({
      kind: 'tool_activity',
      toolActivity: {
        activityType: 'tool_result',
        toolUseId: 'toolu_001',
        toolOutput: [{ type: 'text', text: 'آفتابی است' }],
      },
    });
    expect(answer).toMatchObject({
      kind: 'text',
      content: 'پاسخ نهایی با **تأکید**.',
    });
  });

  it('drops a hidden, summary-less reasoning fragment entirely', () => {
    const parsed = parse(sampleExport);
    if (!parsed.ok) throw new Error('fixture must parse');
    const rawSecond = parsed.data.conversations[1];
    if (rawSecond === undefined) {
      throw new Error('fixture must contain two conversations');
    }
    // conv-0002's m2-0001 holds a hidden thinking fragment with no summary.
    const [conversation] = normalizeClaude({
      providerId: 'claude',
      conversations: [rawSecond],
    });
    if (conversation === undefined) throw new Error('must normalize');

    expect(conversation.messages.map((message) => message.sourceFragmentType)).toEqual([
      'text',
      'tool_use',
      'mystery_card',
    ]);
  });

  it('preserves an unknown fragment verbatim as sourceFragment', () => {
    const second = normalizeFixture()[1];
    if (second === undefined) {
      throw new Error('fixture must normalize to two conversations');
    }
    const unknown = second.messages.find(
      (message) => message.sourceFragmentType === 'mystery_card',
    );

    expect(unknown).toMatchObject({
      kind: 'text',
      role: 'assistant',
      sourceFragment: { type: 'mystery_card', payload: { x: 1 } },
    });
    expect(unknown).not.toHaveProperty('content');
  });
});

describe('normalizeClaude — attachments', () => {
  it('maps the message files array onto a trailing attachment message', () => {
    const conversation = firstConversation();
    const attachment = conversation.messages.at(-1);

    expect(attachment).toMatchObject({
      kind: 'attachment',
      role: 'assistant',
      sourceFragmentType: 'files',
      attachments: [
        // exactOptionalPropertyTypes: no size is exported, so none is invented.
        { fileId: 'file-0001', fileName: '' },
        { fileId: 'file-0002', fileName: 'report.png' },
      ],
    });
    expect(attachment?.attachments?.[0]).not.toHaveProperty('fileSize');
  });
});

describe('normalizeClaude — edge cases', () => {
  it('represents an empty conversation as a valid, empty one', () => {
    const parsed = parse([
      { uuid: 'conv-empty', account: {}, chat_messages: [] },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeClaude(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');
    expect(conversation.messages).toEqual([]);
  });

  it('maps an unattested sender to the unknown role instead of dropping', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          { uuid: 'm1', sender: 'system', content: [{ type: 'text', text: 'x' }] },
        ],
      },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeClaude(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');
    expect(conversation.messages[0]?.role).toBe('unknown');
  });
});


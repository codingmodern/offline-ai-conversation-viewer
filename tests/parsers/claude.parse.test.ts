import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/claude/parse';
import type { ClaudeRawConversation } from '@/parsers/claude/types';
import sampleExport from '../fixtures/claude/sample-export.json';

/**
 * Synthetic fixture only (`context/fixtures/claude/README.md`): the real export
 * stays local, so these tests pin the parser against a shape-true synthetic
 * file whose branching reproduces the real one (sentinel root, last-child
 * live line, thinking variants, tool linkage).
 */

/** Parses the fixture and returns one conversation by index, failing loudly. */
function conversationAt(index: number): ClaudeRawConversation {
  const parsed = parse(sampleExport);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code}`);
  }
  const conversation = parsed.data.conversations[index];
  if (conversation === undefined) {
    throw new Error(`fixture must contain conversation ${String(index)}`);
  }
  return conversation;
}

describe('claude parse — happy path', () => {
  it('parses every conversation and keeps the export array order', () => {
    const parsed = parse(sampleExport);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.providerId).toBe('claude');
    expect(parsed.data.conversations.map((conversation) => conversation.id)).toEqual([
      'conv-0001',
      'conv-0002',
    ]);
  });

  it('maps conversation-level metadata verbatim', () => {
    const first = conversationAt(0);
    const second = conversationAt(1);

    expect(first).toMatchObject({
      id: 'conv-0001',
      title: 'گفتگوی نمونه',
      summary: 'خلاصه‌ای که خود پلتفرم ثبت کرده است.',
      createdAt: '2026-08-30T00:20:01.149417Z',
      updatedAt: '2026-08-30T00:23:03.506758Z',
    });
    // An empty-string summary is what the export states — kept verbatim.
    expect(second.summary).toBe('');
  });

  it('walks the parent tree from the sentinel root, taking the LAST child (ADR #22)', () => {
    const first = conversationAt(0);

    // msg-0002 is the stale regenerate (first sibling): the live line goes
    // msg-0001 → msg-0003 → msg-0004 → msg-0005.
    expect(first.messages.map((message) => message.id)).toEqual([
      'msg-0001',
      'msg-0003',
      'msg-0004',
      'msg-0005',
    ]);
  });

  it('keeps fragments in export array order inside each message', () => {
    const first = conversationAt(0);
    const assistant = first.messages.find((message) => message.id === 'msg-0003');

    expect(assistant?.fragments.map((fragment) => fragment.type)).toEqual([
      'thinking',
      'tool_use',
      'tool_result',
      'text',
    ]);
  });

  it('extracts the thinking variants the census attested', () => {
    // The fixture's live line carries a visible body; the hidden+summary
    // variant is exercised on an inline live line, because a real export only
    // ever shows it on *dead* regenerate branches (ADR #22 drops those).
    const inline = parse([
      {
        uuid: 'conv-x',
        account: {},
        chat_messages: [
          {
            uuid: 'q',
            sender: 'human',
            content: [{ type: 'text', text: 'سوال' }],
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
          },
          {
            uuid: 'a',
            sender: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: '',
                summaries: [{ summary: 'پاسخ قدیمی' }],
                hidden: true,
                thinking_hidden: true,
              },
              { type: 'thinking', thinking: 'بودجه‌بندی پاسخ.', thinking_hidden: false },
            ],
            parent_message_uuid: 'q',
          },
        ],
      },
    ]);
    if (!inline.ok) throw new Error('inline fixture must parse');
    const [conversation] = inline.data.conversations;
    if (conversation === undefined) throw new Error('must exist');
    const [hidden, visible] = conversation.messages[1]?.fragments ?? [];

    expect(hidden).toEqual({
      type: 'thinking',
      thinking: '',
      thinkingHidden: true,
      thinkingSummary: 'پاسخ قدیمی',
    });
    expect(visible).toEqual({ type: 'thinking', thinking: 'بودجه‌بندی پاسخ.' });

    // The fixture's own live reasoning keeps its full body verbatim.
    const first = conversationAt(0);
    const live = first.messages.find((message) => message.id === 'msg-0003');
    expect(live?.fragments[0]).toMatchObject({
      type: 'thinking',
      thinking: 'ابتدا درخواست را بررسی می‌کنم.\nسپس پاسخ را می‌نویسم.',
    });
  });

  it('carries tool_use/tool_result payloads verbatim, linked by id', () => {
    const first = conversationAt(0);
    const live = first.messages.find((message) => message.id === 'msg-0003');

    expect(live?.fragments[1]).toEqual({
      type: 'tool_use',
      toolId: 'toolu_001',
      toolName: 'web_search',
      toolInput: { query: 'وضعیت هوا' },
    });
    expect(live?.fragments[2]).toEqual({
      type: 'tool_result',
      toolUseId: 'toolu_001',
      toolName: 'web_search',
      toolOutput: [{ type: 'text', text: 'آفتابی است' }],
    });
  });

  it('keeps message-level files verbatim, including empty names', () => {
    const first = conversationAt(0);
    const withFiles = first.messages.find((message) => message.id === 'msg-0005');

    expect(withFiles?.files).toEqual([
      { fileId: 'file-0001', fileName: '' },
      { fileId: 'file-0002', fileName: 'report.png' },
    ]);
  });

  it('preserves an unrecognised fragment type verbatim instead of dropping it', () => {
    const second = conversationAt(1);
    const assistant = second.messages.find((message) => message.id === 'm2-0002');

    expect(assistant?.fragments[1]).toEqual({
      type: 'mystery_card',
      sourceFragment: { type: 'mystery_card', payload: { x: 1 } },
    });
  });
});

describe('claude parse — typed failures', () => {
  it.each([
    ['a bare object', { uuid: 'conv-1' }],
    ['a string', 'claude'],
    ['null', null],
  ])('rejects %s as root', (_label, payload) => {
    const parsed = parse(payload);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects an empty export', () => {
    const parsed = parse([]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects a conversation without chat_messages', () => {
    const parsed = parse([{ uuid: 'conv-1', account: {} }]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
      expect(parsed.error.detail).toContain('chat_messages');
    }
  });

  it('rejects a message without a uuid', () => {
    const parsed = parse([
      { uuid: 'conv-1', account: {}, chat_messages: [{ sender: 'human', content: [] }] },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
      expect(parsed.error.detail).toContain('uuid');
    }
  });

  it('rejects a message whose parent link is not a string', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          { uuid: 'm1', sender: 'human', content: [], parent_message_uuid: 42 },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
      expect(parsed.error.detail).toContain('parent_message_uuid');
    }
  });

  it('rejects a text fragment without a text body', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          { uuid: 'm1', sender: 'human', content: [{ type: 'text' }] },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects a tool_use without an id (the linkage key)', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'assistant',
            content: [{ type: 'tool_use', name: 'web_search', input: {} }],
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects a tool_result without a tool_use_id', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'assistant',
            content: [{ type: 'tool_result', content: [] }],
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects a thinking fragment whose summaries is not an array', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'assistant',
            content: [{ type: 'thinking', thinking: 'x', summaries: 'nope' }],
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects a files entry missing its file_name', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'human',
            content: [],
            files: [{ file_uuid: 'f1' }],
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects a content value that is not an array', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [{ uuid: 'm1', sender: 'human', content: 'text' }],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects graph corruption: a duplicate message uuid', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'human',
            content: [{ type: 'text', text: 'a' }],
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
          },
          {
            uuid: 'm1',
            sender: 'assistant',
            content: [{ type: 'text', text: 'b' }],
            parent_message_uuid: 'm1',
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnsupportedFormatError');
      expect(parsed.error.detail).toContain('m1');
    }
  });

  it('rejects graph corruption: a parent link to a uuid the file never defines', () => {
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'human',
            content: [{ type: 'text', text: 'a' }],
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
          },
          {
            uuid: 'm2',
            sender: 'assistant',
            content: [{ type: 'text', text: 'b' }],
            parent_message_uuid: 'ghost',
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnsupportedFormatError');
      expect(parsed.error.detail).toContain('ghost');
    }
  });

  it('rejects graph corruption: a cycle in the parent graph', () => {
    // m2 ↔ m3 form a cycle; because a cycle node's parent is always another
    // cycle node, the pair is unreachable from the root — caught by the
    // reachability rule.
    const parsed = parse([
      {
        uuid: 'conv-1',
        account: {},
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'human',
            content: [{ type: 'text', text: 'a' }],
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
          },
          {
            uuid: 'm2',
            sender: 'assistant',
            content: [{ type: 'text', text: 'b' }],
            parent_message_uuid: 'm3',
          },
          {
            uuid: 'm3',
            sender: 'assistant',
            content: [{ type: 'text', text: 'c' }],
            parent_message_uuid: 'm2',
          },
        ],
      },
    ]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnsupportedFormatError');
      expect(parsed.error.detail).toContain('unreachable');
    }
  });
});


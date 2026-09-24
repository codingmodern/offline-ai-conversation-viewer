import { describe, expect, it } from 'vitest';
import { normalizeDeepSeek } from '@/normalization/deepseek';
import { normalizeConversations } from '@/normalization/normalizeConversations';
import type { DeepSeekRawData } from '@/parsers/deepseek/types';

type RawConversation = DeepSeekRawData['conversations'][number];
type RawFragment = RawConversation['fragments'][number];

/**
 * Builds `parse()`-shaped input directly: normalization never sees raw JSON.
 *
 * `category` and `turnIndex` are filled in when a case does not care about them,
 * so each test states only the fields it is actually about. Every fragment
 * defaults to its own turn — the common case of one message per node.
 */
function rawData(
  fragments: readonly PartialFragment[],
  overrides: Partial<RawConversation> = {},
): DeepSeekRawData {
  return {
    providerId: 'deepseek',
    conversations: [{ id: 'c1', fragments: fragments.map(toFragment), ...overrides }],
  };
}

type PartialFragment = Omit<RawFragment, 'category' | 'turnIndex'> &
  Partial<Pick<RawFragment, 'category' | 'turnIndex'>>;

function toFragment(fragment: PartialFragment, index: number): RawFragment {
  return {
    category: fragment.category ?? inferCategory(fragment),
    turnIndex: fragment.turnIndex ?? index,
    ...fragment,
  };
}

/** Mirrors what `parse()` would have decided, so tests stay in sync with it. */
function inferCategory(fragment: PartialFragment): RawFragment['category'] {
  if (fragment.files !== undefined) return 'attachment';
  if (fragment.content !== undefined) return 'text';
  return 'toolActivity';
}

describe('normalizeDeepSeek', () => {
  it('maps REQUEST to user and RESPONSE to assistant', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', content: 'q' },
        { type: 'RESPONSE', content: 'a' },
      ]),
    );

    expect(conversation?.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('labels an unrecognised fragment type unknown instead of dropping it', () => {
    // Edge Cases: losing a message is worse than labelling it imprecisely.
    const [conversation] = normalizeDeepSeek(
      rawData([{ type: 'SEARCHING', category: 'text', content: 'tool output' }]),
    );

    expect(conversation?.messages).toEqual([
      {
        role: 'unknown',
        kind: 'text',
        content: 'tool output',
        // The raw type survives even when the role could not be resolved.
        sourceFragmentType: 'SEARCHING',
        order: 0,
      },
    ]);
  });

  it('stamps sourceProvider and keeps the export id as sourceConversationId', () => {
    const [conversation] = normalizeDeepSeek(rawData([], { id: 'abc-123' }));

    expect(conversation?.sourceProvider).toBe('deepseek');
    expect(conversation?.sourceConversationId).toBe('abc-123');
  });

  it('numbers messages from 0 in the order parse() produced them', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', content: 'first' },
        { type: 'RESPONSE', content: 'second' },
        { type: 'REQUEST', content: 'third' },
      ]),
    );

    expect(conversation?.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(conversation?.messages.map((message) => message.content)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('carries content, model and timestamp through untouched', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        {
          type: 'RESPONSE',
          content: '  spaced  text  ',
          model: 'deepseek-chat',
          insertedAt: '2026-08-20T23:24:36.682000+08:00',
        },
      ]),
    );

    expect(conversation?.messages[0]).toEqual({
      role: 'assistant',
      kind: 'text',
      // Never trimmed or re-formatted.
      content: '  spaced  text  ',
      sourceFragmentType: 'RESPONSE',
      order: 0,
      model: 'deepseek-chat',
      createdAt: '2026-08-20T23:24:36.682000+08:00',
    });
  });

  it('maps conversation metadata onto the unified names', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([], {
        title: 'Sample conversation 1',
        insertedAt: '2026-08-20T23:23:45.861000+08:00',
        updatedAt: '2026-08-20T23:25:55.182000+08:00',
      }),
    );

    expect(conversation).toMatchObject({
      title: 'Sample conversation 1',
      createdAt: '2026-08-20T23:23:45.861000+08:00',
      updatedAt: '2026-08-20T23:25:55.182000+08:00',
    });
  });

  it('takes updatedAt from the conversation-level field, not the newest message', () => {
    // Open Question #3 / ADR #8. The two values genuinely differ, so this asserts
    // which one wins: `updated_at` here is *later* than every message timestamp.
    const [conversation] = normalizeDeepSeek(
      rawData(
        [
          { type: 'REQUEST', content: 'q', insertedAt: '2026-08-20T23:25:52.537000+08:00' },
          { type: 'RESPONSE', content: 'a', insertedAt: '2026-08-20T23:25:52.533000+08:00' },
        ],
        { updatedAt: '2026-08-20T23:25:55.182000+08:00' },
      ),
    );

    expect(conversation?.updatedAt).toBe('2026-08-20T23:25:55.182000+08:00');
    // Explicitly *not* the newest message's timestamp.
    expect(conversation?.updatedAt).not.toBe('2026-08-20T23:25:52.537000+08:00');
  });

  it('keeps updatedAt even when it predates the newest message', () => {
    // The inverse ordering must not tempt normalization into "correcting" the
    // exported value: it is reported as recorded, never recomputed.
    const [conversation] = normalizeDeepSeek(
      rawData(
        [{ type: 'RESPONSE', content: 'a', insertedAt: '2026-08-21T10:00:00.000000+08:00' }],
        {
          updatedAt: '2026-08-20T23:25:55.182000+08:00',
        },
      ),
    );

    expect(conversation?.updatedAt).toBe('2026-08-20T23:25:55.182000+08:00');
  });

  it('omits updatedAt when the export states none, instead of deriving one', () => {
    // A missing `updated_at` stays missing: inventing it from message timestamps
    // would fabricate a time the platform never recorded (ADR #8).
    const [conversation] = normalizeDeepSeek(
      rawData([{ type: 'REQUEST', content: 'q', insertedAt: '2026-08-20T23:25:52.537000+08:00' }]),
    );

    expect(conversation).not.toHaveProperty('updatedAt');
  });

  it('omits absent optional fields rather than setting them to undefined', () => {
    const [conversation] = normalizeDeepSeek(rawData([{ type: 'REQUEST', content: 'q' }]));

    expect(conversation).not.toHaveProperty('title');
    expect(conversation).not.toHaveProperty('createdAt');
    expect(conversation).not.toHaveProperty('updatedAt');
    expect(conversation?.messages[0]).not.toHaveProperty('model');
    expect(conversation?.messages[0]).not.toHaveProperty('createdAt');
  });

  it('keeps a conversation with no messages instead of discarding it', () => {
    const conversations = normalizeDeepSeek(rawData([]));

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.messages).toEqual([]);
  });

  it('normalizes every conversation in a multi-conversation export', () => {
    const conversations = normalizeDeepSeek({
      providerId: 'deepseek',
      conversations: [
        {
          id: 'c1',
          fragments: [{ type: 'REQUEST', category: 'text', turnIndex: 0, content: 'q1' }],
        },
        {
          id: 'c2',
          fragments: [{ type: 'RESPONSE', category: 'text', turnIndex: 0, content: 'a2' }],
        },
      ],
    });

    expect(conversations.map((conversation) => conversation.sourceConversationId)).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('does not leak DeepSeek vocabulary into the unified model', () => {
    const [conversation] = normalizeDeepSeek(rawData([{ type: 'REQUEST', content: 'q' }]));

    expect(conversation).not.toHaveProperty('fragments');
    expect(conversation).not.toHaveProperty('mapping');
    // `type`/`category` are provider words; the raw value is exposed only under
    // the neutral `sourceFragmentType` name.
    expect(conversation?.messages[0]).not.toHaveProperty('type');
    expect(conversation?.messages[0]).not.toHaveProperty('category');
    expect(conversation?.messages[0]?.sourceFragmentType).toBe('REQUEST');
  });
});

/** The mapping table in `architecture.md` §2, asserted type by type. */
describe('normalizeDeepSeek — fragment type mapping', () => {
  it.each([
    ['REQUEST', 'user'],
    ['RESPONSE', 'assistant'],
    ['THINK', 'assistant'],
  ] as const)('maps %s text to the %s role', (type, role) => {
    const [conversation] = normalizeDeepSeek(rawData([{ type, content: 'body' }]));

    expect(conversation?.messages[0]).toMatchObject({ role, kind: 'text', content: 'body' });
  });

  it('keeps THINK distinct from RESPONSE via sourceFragmentType, not a third role', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'THINK', content: 'reasoning' },
        { type: 'RESPONSE', content: 'answer' },
      ]),
    );

    // Same role and kind — a renderer separates them by the raw type alone.
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'assistant',
      'assistant',
    ]);
    expect(conversation?.messages.map((message) => message.sourceFragmentType)).toEqual([
      'THINK',
      'RESPONSE',
    ]);
  });

  it.each(['SEARCH', 'TOOL_SEARCH'] as const)(
    'maps %s to assistant tool activity carrying the raw results',
    (type) => {
      const results = [{ title: 'Placeholder result', url: 'https://example.invalid/a' }];

      const [conversation] = normalizeDeepSeek(rawData([{ type, results }]));

      expect(conversation?.messages[0]).toMatchObject({
        role: 'assistant',
        kind: 'tool_activity',
        toolActivity: { activityType: type, results },
      });
      // Tool activity is not text, so no content is invented for it.
      expect(conversation?.messages[0]).not.toHaveProperty('content');
    },
  );

  it('passes the results payload through by reference, unreshaped', () => {
    const results = { nested: { arbitrary: ['shape', 1, null] } };

    const [conversation] = normalizeDeepSeek(rawData([{ type: 'SEARCH', results }]));

    // Identity, not just deep equality: nothing copied it into a new shape.
    expect(conversation?.messages[0]?.toolActivity?.results).toBe(results);
  });

  it.each(['TOOL_OPEN', 'TOOL_FIND'] as const)(
    'maps %s to tool activity with no results field at all',
    (type) => {
      const [conversation] = normalizeDeepSeek(rawData([{ type }]));

      expect(conversation?.messages[0]).toEqual({
        role: 'assistant',
        kind: 'tool_activity',
        toolActivity: { activityType: type },
        sourceFragmentType: type,
        order: 0,
      });
      // Absent is absent: an empty `results` would be fabricated data.
      expect(conversation?.messages[0]?.toolActivity).not.toHaveProperty('results');
    },
  );

  it('maps FILE to an attachment message with every file it carried', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', content: 'q', turnIndex: 0 },
        {
          type: 'FILE',
          turnIndex: 0,
          files: [
            { fileId: 'f-1', fileName: 'placeholder-a.pdf', fileSize: 10 },
            { fileId: 'f-2', fileName: 'placeholder-b.png', fileSize: 20 },
          ],
        },
      ]),
    );

    expect(conversation?.messages[1]).toMatchObject({
      kind: 'attachment',
      attachments: [
        { fileId: 'f-1', fileName: 'placeholder-a.pdf', fileSize: 10 },
        { fileId: 'f-2', fileName: 'placeholder-b.png', fileSize: 20 },
      ],
    });
    expect(conversation?.messages[1]).not.toHaveProperty('content');
  });

  it('inherits a FILE role from the user turn it belongs to', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'FILE', turnIndex: 0, files: [{ fileId: 'f', fileName: 'a.pdf', fileSize: 1 }] },
        { type: 'REQUEST', turnIndex: 0, content: 'What is in this file?' },
      ]),
    );

    // The attachment states no sender itself; it belongs to whoever sent the turn.
    expect(conversation?.messages[0]?.role).toBe('user');
  });

  it('inherits a FILE role from the assistant turn it belongs to', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', turnIndex: 0, content: 'q' },
        { type: 'RESPONSE', turnIndex: 1, content: 'Here is the output.' },
        { type: 'FILE', turnIndex: 1, files: [{ fileId: 'f', fileName: 'a.pdf', fileSize: 1 }] },
      ]),
    );

    expect(conversation?.messages[2]?.role).toBe('assistant');
  });

  it('inherits from the preceding turn when a FILE arrives on its own', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', turnIndex: 0, content: 'q' },
        { type: 'FILE', turnIndex: 1, files: [{ fileId: 'f', fileName: 'a.pdf', fileSize: 1 }] },
      ]),
    );

    // A file uploaded alone still belongs to the person who uploaded it.
    expect(conversation?.messages[1]?.role).toBe('user');
  });

  it('leaves a FILE role unknown when nothing in the export states one', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'FILE', turnIndex: 0, files: [{ fileId: 'f', fileName: 'a.pdf', fileSize: 1 }] },
      ]),
    );

    // No REQUEST/RESPONSE anywhere: `unknown` is honest, a guess would not be.
    expect(conversation?.messages[0]?.role).toBe('unknown');
  });

  it('sets exactly one payload field per message kind', () => {
    const [conversation] = normalizeDeepSeek(
      rawData([
        { type: 'REQUEST', turnIndex: 0, content: 'q' },
        { type: 'FILE', turnIndex: 0, files: [{ fileId: 'f', fileName: 'a.pdf', fileSize: 1 }] },
        { type: 'SEARCH', turnIndex: 1, results: [] },
      ]),
    );

    const [text, attachment, toolActivity] = conversation?.messages ?? [];
    expect(Object.keys(text ?? {})).toEqual(expect.arrayContaining(['content']));
    expect(text).not.toHaveProperty('attachments');
    expect(text).not.toHaveProperty('toolActivity');
    expect(attachment).not.toHaveProperty('content');
    expect(attachment).not.toHaveProperty('toolActivity');
    expect(toolActivity).not.toHaveProperty('content');
    expect(toolActivity).not.toHaveProperty('attachments');
  });
});

describe('normalizeConversations dispatch', () => {
  it('routes deepseek Raw Data to the deepseek mapper', () => {
    const raw = rawData([{ type: 'REQUEST', content: 'q' }]);

    // Same result via the dispatcher as via the mapper directly: the switch adds
    // routing only, never a second mapping rule.
    expect(normalizeConversations(raw)).toEqual(normalizeDeepSeek(raw));
  });

  it('is the only layer that produces sourceProvider-stamped conversations', () => {
    const [conversation] = normalizeConversations(rawData([{ type: 'REQUEST', content: 'q' }]));

    expect(conversation?.sourceProvider).toBe('deepseek');
  });
});

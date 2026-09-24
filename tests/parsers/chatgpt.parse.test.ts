import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/chatgpt/parse';
import { detect } from '@/parsers/chatgpt/detect';
// Synthetic fixtures only, and ChatGPT is **Unverified**: see
// `context/fixtures/chatgpt/README.md`.
import minimal from '../fixtures/chatgpt/minimal.json';
import structure from '../fixtures/chatgpt/structure.json';
import branching from '../fixtures/chatgpt/branching.json';
import hostile from '../fixtures/chatgpt/hostile.json';

/** One ChatGPT-shaped message. */
function chatgptMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    author: { role: 'user' },
    content: { content_type: 'text', parts: ['hi'] },
    weight: 1,
    metadata: {},
    recipient: 'all',
    ...overrides,
  };
}

/** A two-node conversation: a structural root and one message. */
function singleNodeConversation(
  message: Record<string, unknown> = chatgptMessage(),
  currentNode = 'n1',
): Record<string, unknown> {
  return {
    id: 'c1',
    current_node: currentNode,
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['n1'] },
      n1: { id: 'n1', message, parent: 'root', children: [] },
    },
  };
}

describe('chatgpt parse — the owner-supplied sample', () => {
  it('imports the sample unchanged: 1 conversation, 3 messages in file order (AC1)', () => {
    const result = parse(minimal as unknown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.providerId).toBe('chatgpt');
    expect(result.data.skipped).toEqual([]);
    expect(result.data.conversations).toHaveLength(1);

    const [conversation] = result.data.conversations;
    expect(conversation?.id).toBe('conversation-uuid');
    expect(conversation?.title).toBe('عنوان گفتگو');
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(conversation?.messages.map((message) => message.contentType)).toEqual([
      'text',
      'text',
      'text',
    ]);
    expect(conversation?.createTime).toBe(1750000000.123);
    expect(conversation?.updateTime).toBe(1750000100.456);
  });

  it('carries the sample verbatim: parts, weights, per-message model slug', () => {
    const result = parse(minimal as unknown);
    if (!result.ok) throw new Error('sample must parse');
    // The first message is the USER message (no model_slug); the assistant
    // message carries the slug.
    const [, assistant] = result.data.conversations[0]?.messages ?? [];
    const [user] = result.data.conversations[0]?.messages ?? [];

    expect(user?.parts).toEqual(['سلام']);
    expect(user?.weight).toBe(1.0);
    expect(user?.modelSlug).toBeUndefined();
    expect(assistant?.modelSlug).toBe('gpt-5');
    expect(user?.createTime).toBe(1750000000.123);
    expect(user?.rawContent).toEqual({ content_type: 'text', parts: ['سلام'] });
  });

  it('never produces the unified model from the parser (FR1 boundary)', () => {
    const result = parse(minimal as unknown);
    if (!result.ok) throw new Error('sample must parse');
    const [conversation] = result.data.conversations;

    expect(conversation).not.toHaveProperty('sourceProvider');
    expect(conversation?.messages[0]).not.toHaveProperty('kind');
    expect(conversation?.messages[0]).not.toHaveProperty('content');
  });

  it('is deterministic: the same input produces the same output', () => {
    expect(parse(minimal as unknown)).toEqual(parse(minimal as unknown));
  });
});

describe('chatgpt parse — branch resolution (FR-4)', () => {
  it('follows the current_node path, not the first child', () => {
    const result = parse(branching as unknown);
    if (!result.ok) throw new Error('branching must parse');
    const [conversation] = result.data.conversations;

    expect(conversation?.messages.map((message) => message.id)).toEqual([
      'm-u1',
      'm-a-active',
      'm-a-active-2',
    ]);
  });

  it('falls back to the last-child path when current_node is removed (AC3)', () => {
    const [conversation] = (branching as Array<Record<string, unknown>>).filter(
      (entry) => entry.id === 'branch-conv',
    );
    const withoutCurrent: Record<string, unknown> = { ...conversation };
    delete withoutCurrent.current_node;

    expect(detect([withoutCurrent])).toBe(true);

    const result = parse([withoutCurrent]);
    if (!result.ok) throw new Error('branching without current_node must parse');
    expect(result.data.conversations[0]?.messages.map((message) => message.id)).toEqual([
      'm-u1',
      'm-a-last',
    ]);
  });

  it('falls back to the last-child path when current_node is unknown', () => {
    const result = parse(hostile as unknown);
    if (!result.ok) throw new Error('hostile must parse');
    const cycle = result.data.conversations.find(
      (conversation) => conversation.id === 'hostile-cycle',
    );

    expect(cycle?.messages.map((message) => message.id)).toEqual([
      'm-k-a',
      'm-k-b',
      'm-k-c',
      'm-k-d',
      'm-k-orphan',
    ]);
  });

  it('terminates on a broken current_node path (cycle) and falls back', () => {
    // c1's parent chain loops: c1 → c2 → c1. The upward walk must stop instead
    // of looping forever, and the FR-4 fallbacks must take over.
    const cyclic = [
      {
        id: 'c1',
        current_node: 'c1',
        mapping: {
          c1: { id: 'c1', message: chatgptMessage({ create_time: 30 }), parent: 'c2', children: [] },
          c2: { id: 'c2', message: chatgptMessage({ create_time: 40 }), parent: 'c1', children: [] },
        },
      },
    ];

    const result = parse(cyclic);
    if (!result.ok) throw new Error('cyclic path must parse');
    // Both nodes become roots through the dangling-parent rule, so the
    // last-child line covers them in mapping order — and never loops.
    expect(result.data.conversations[0]?.messages.map((message) => message.createTime)).toEqual([
      30,
      40,
    ]);
  });

  it('uses the time-ordered fallback when the last-child line is empty', () => {
    // The only root's line holds no message at all (root → structural node),
    // while the two real messages hang off that structural node through `parent`
    // links that no `children` array mentions: unreachable from the line, so
    // FR-4's last fallback orders them by time.
    const detached = [
      {
        id: 'c1',
        mapping: {
          root: { id: 'root', message: null, parent: null, children: ['x'] },
          x: { id: 'x', message: null, parent: 'root', children: [] },
          y1: { id: 'y1', message: chatgptMessage({ create_time: 20 }), parent: 'x', children: [] },
          y2: { id: 'y2', message: chatgptMessage({ create_time: 10 }), parent: 'x', children: [] },
        },
      },
    ];

    const result = parse(detached);
    if (!result.ok) throw new Error('detached mapping must parse');
    expect(result.data.conversations[0]?.messages.map((message) => message.createTime)).toEqual([
      10,
      20,
    ]);
  });

  it('treats a parent that points at a missing node as a root', () => {
    // The parent 'ghost' never resolves into a node, so the upward walk stops
    // at n1 itself: dangling parents end walks everywhere (FR-4).
    const mapping = {
      root: { id: 'root', message: null, parent: null, children: ['n1'] },
      n1: {
        id: 'n1',
        message: chatgptMessage({ create_time: 50 }),
        parent: 'ghost',
        children: [],
      },
    };

    const result = parse([{ id: 'c1', current_node: 'n1', mapping }]);
    if (!result.ok) throw new Error('dangling parent must parse');
    expect(result.data.conversations[0]?.messages).toHaveLength(1);
    expect(result.data.conversations[0]?.messages[0]?.createTime).toBe(50);
  });
});

describe('chatgpt parse — times (FR-9)', () => {
  it('inherits the nearest ancestor’s time for a message that carries none', () => {
    const result = parse(structure as unknown);
    if (!result.ok) throw new Error('structure must parse');
    const [conversation] = result.data.conversations;

    // The first two messages carry `create_time: null`; the nearest ancestor
    // with a time is the `model_editable_context` node (1750000204).
    const times = conversation?.messages.map((message) => message.createTime);
    expect(times?.[0]).toBe(1750000204.0);
    expect(times?.[1]).toBe(1750000204.0);
    expect(times?.[2]).toBe(1750000500.5);
  });

  it('keeps a null conversation time absent instead of fabricating one', () => {
    const result = parse(structure as unknown);
    if (!result.ok) throw new Error('structure must parse');

    expect(result.data.conversations[0]?.createTime).toBeUndefined();
    expect(result.data.conversations[0]?.updateTime).toBeUndefined();
  });
});

describe('chatgpt parse — conversation isolation (FR-3, ADR-J)', () => {
  it('skips the broken conversation and keeps both valid ones (AC7)', () => {
    const result = parse(hostile as unknown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations.map((conversation) => conversation.id)).toEqual([
      'hostile-valid-1',
      'hostile-cycle',
      'hostile-valid-2',
    ]);
    expect(result.data.skipped).toEqual([{ id: 'hostile-no-mapping', reason: 'missing mapping' }]);
  });

  it('fails the file loudly when every entry is skipped (ADR-J)', () => {
    const result = parse([
      { title: 'no id and no mapping' },
      { conversation_id: 'also unusable: no mapping at all' },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnsupportedFormatError');
    expect(result.error.detail).toContain('Every conversation was skipped');
  });

  it('records missing id when the mapping is usable but the id is not', () => {
    const result = parse([
      { title: 'no usable id', mapping: singleNodeConversation().mapping },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnsupportedFormatError');
    expect(result.error.detail).toContain('missing id');
  });

  it('falls back to conversation_id when id is unusable, skips when neither works', () => {
    const result = parse([
      { id: 42, conversation_id: 'fallback-id', mapping: singleNodeConversation().mapping },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations[0]?.id).toBe('fallback-id');
  });

  it('rejects a non-array root and an empty export as typed errors', () => {
    expect(parse({ not: 'an array' })).toMatchObject({
      ok: false,
      error: { code: 'UnexpectedTypeError' },
    });
    expect(parse([])).toMatchObject({ ok: false, error: { code: 'MissingFieldError' } });
  });

  it('skips a message without content or author and continues the conversation', () => {
    const mapping = {
      root: { id: 'root', message: null, parent: null, children: ['n1', 'n2'] },
      n1: { id: 'n1', message: { model: 'gpt-5' }, parent: 'root', children: [] },
      n2: {
        id: 'n2',
        message: chatgptMessage({ content: { content_type: 'text', parts: ['kept'] } }),
        parent: 'root',
        children: [],
      },
    };

    const result = parse([{ id: 'c1', mapping }]);
    if (!result.ok) throw new Error('must parse');
    expect(result.data.conversations[0]?.messages).toHaveLength(1);
    expect(result.data.conversations[0]?.messages[0]?.parts).toEqual(['kept']);
  });

  it('ignores unknown keys on the conversation and its nodes', () => {
    const noisy = singleNodeConversation();
    const mapping = noisy.mapping as Record<string, Record<string, unknown>>;
    for (const node of Object.values(mapping)) {
      node.conversation_template_id = 'x';
    }
    (noisy as Record<string, unknown>).is_archived = true;

    const result = parse([noisy]);
    if (!result.ok) throw new Error('must parse');
    expect(result.data.conversations[0]?.messages).toHaveLength(1);
  });

  it('never throws, whatever the input', () => {
    expect(() => parse(undefined)).not.toThrow();
    expect(() => parse([null])).not.toThrow();
    expect(() => parse([1, 2, 3])).not.toThrow();
    expect(() => parse([{ id: 'c1', mapping: { n: 'not-a-node' } }])).not.toThrow();
    expect(() =>
      parse([{ id: 'c1', mapping: { n: { parent: 42, children: 'nope' } } }]),
    ).not.toThrow();
  });
});

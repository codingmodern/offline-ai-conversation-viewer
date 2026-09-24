import { describe, expect, it } from 'vitest';
import { detect } from '@/parsers/claude/detect';
// Synthetic fixture only: the real Claude export stays local (see
// `context/fixtures/claude/README.md`) and never enters the repository.
import sampleExport from '../fixtures/claude/sample-export.json';

/** Minimal valid shape, mirroring the fixture's essential fields. */
function conversation(): unknown {
  return {
    uuid: 'conv-1',
    name: 'Sample',
    summary: 'x',
    account: { uuid: 'acct-1' },
    chat_messages: [
      {
        uuid: 'msg-1',
        sender: 'human',
        content: [{ type: 'text', text: 'hi' }],
        parent_message_uuid: '00000000-0000-4000-8000-000000000000',
      },
    ],
  };
}

describe('claude detect', () => {
  it('accepts the shape-true synthetic export fixture', () => {
    expect(detect(sampleExport)).toBe(true);
  });

  it('accepts a minimal conversation (structure only, no timestamps)', () => {
    expect(detect([conversation()])).toBe(true);
  });

  it('rejects a DeepSeek-shaped mapping export (no chat_messages/account)', () => {
    const deepSeekLike = [
      {
        id: 'c1',
        mapping: {
          root: { id: 'root', parent: null, children: ['1'], message: null },
          '1': {
            id: '1',
            parent: 'root',
            children: [],
            message: { fragments: [{ type: 'REQUEST', content: 'hi' }] },
          },
        },
      },
    ];

    expect(detect(deepSeekLike)).toBe(false);
  });

  it('rejects a message list that lacks the account key (ChatGPT-style files)', () => {
    const chatGptLike = [
      {
        title: 'Sample',
        chat_messages: [{ sender: 'human', content: [] }],
      },
    ];

    expect(detect(chatGptLike)).toBe(false);
  });

  it('rejects a conversation whose messages lack senders', () => {
    const senderless = [
      {
        account: { uuid: 'acct-1' },
        chat_messages: [{ uuid: 'msg-1', content: [] }],
      },
    ];

    expect(detect(senderless)).toBe(false);
  });

  it('rejects a conversation whose messages lack the linkage/payload keys', () => {
    const skeletal = [
      {
        account: { uuid: 'acct-1' },
        chat_messages: [{ uuid: 'msg-1', sender: 'human' }],
      },
    ];

    expect(detect(skeletal)).toBe(false);
  });

  it('rejects an export with empty chat_messages (proves nothing)', () => {
    expect(detect([{ account: {}, chat_messages: [] }])).toBe(false);
  });

  it('rejects when only some elements are Claude conversations', () => {
    expect(detect([conversation(), { unrelated: true }])).toBe(false);
  });

  it.each([
    ['an empty array', []],
    ['an array of numbers', [1, 2, 3]],
    ['a bare object', { chat_messages: [] }],
    ['null', null],
    ['a string', 'claude'],
    ['a number', 42],
  ])('rejects %s', (_label, payload) => {
    expect(detect(payload)).toBe(false);
  });

  it('requires the array wrapper the real export uses, not a bare conversation', () => {
    // Guards against loosening the signature: structure alone decides (FR2).
    expect(detect(conversation())).toBe(false);
    expect(detect([conversation()])).toBe(true);
  });
});

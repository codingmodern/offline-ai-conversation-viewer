import { describe, expect, it } from 'vitest';
import { detect } from '@/parsers/deepseek/detect';
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
import sampleReal from '../fixtures/deepseek/sample-real.json';

/** Minimal valid shape, mirroring the fixture's essential fields. */
function conversation(): unknown {
  return {
    id: 'c1',
    title: 'Sample',
    mapping: {
      root: { id: 'root', parent: null, children: ['1'], message: null },
      '1': {
        id: '1',
        parent: 'root',
        children: [],
        message: { fragments: [{ type: 'REQUEST', content: 'hi' }] },
      },
    },
  };
}

describe('deepseek detect', () => {
  it('accepts the real anonymized export fixture', () => {
    expect(detect(sampleReal)).toBe(true);
  });

  it('accepts a minimal conversation with a RESPONSE fragment', () => {
    const data = [
      {
        mapping: {
          '1': { message: { fragments: [{ type: 'RESPONSE', content: 'hello' }] } },
        },
      },
    ];

    expect(detect(data)).toBe(true);
  });

  it('rejects a ChatGPT-shaped mapping export (no fragment vocabulary)', () => {
    // Same `mapping` container, different message model — must not be claimed,
    // otherwise adding ChatGPT later would trigger ambiguous detection.
    const chatGptLike = {
      title: 'Sample',
      create_time: 1710000000,
      mapping: {
        '1': {
          id: '1',
          message: {
            author: { role: 'user' },
            content: { content_type: 'text', parts: ['hello'] },
          },
        },
      },
    };

    expect(detect(chatGptLike)).toBe(false);
    // Also false when wrapped in an array, as some exports are.
    expect(detect([chatGptLike])).toBe(false);
  });

  it('rejects a conversation whose messages lack fragments (incomplete export)', () => {
    const missingFragments = [
      { id: 'c1', title: 'Sample', mapping: { '1': { id: '1', message: { model: 'x' } } } },
    ];

    expect(detect(missingFragments)).toBe(false);
  });

  it('rejects a conversation with no mapping at all', () => {
    expect(detect([{ id: 'c1', title: 'Sample' }])).toBe(false);
  });

  it('rejects a mapping that only holds structural nodes (no real message)', () => {
    const onlyRoot = [{ mapping: { root: { id: 'root', message: null } } }];

    expect(detect(onlyRoot)).toBe(false);
  });

  it('rejects when only some elements are DeepSeek conversations', () => {
    expect(detect([conversation(), { unrelated: true }])).toBe(false);
  });

  it.each([
    ['an empty array', []],
    ['an array of numbers', [1, 2, 3]],
    ['a bare object', { messages: [] }],
    ['null', null],
    ['a string', 'deepseek'],
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

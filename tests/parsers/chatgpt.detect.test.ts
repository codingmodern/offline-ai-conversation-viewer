import { describe, expect, it } from 'vitest';
import { detect } from '@/parsers/chatgpt/detect';
// Synthetic fixtures only, and ChatGPT is **Unverified**: see
// `context/fixtures/chatgpt/README.md`. The other providers' fixtures are used
// as negative cases, exactly as their own suites use ours.
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
import deepseekSample from '../fixtures/deepseek/sample-real.json';
import claudeSample from '../fixtures/claude/sample-export.json';
import geminiSample from '../fixtures/gemini/sample-export.json';

/** One ChatGPT-shaped message, mirroring the fields the signature needs. */
function chatgptMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    author: { role: 'user' },
    content: { content_type: 'text', parts: ['hi'] },
    ...overrides,
  };
}

/** One ChatGPT-shaped conversation with a single message node. */
function conversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    mapping: {
      n1: { id: 'n1', message: chatgptMessage(), parent: null, children: [] },
    },
    ...overrides,
  };
}

describe('chatgpt detect', () => {
  it('accepts every committed conversation fixture', () => {
    const fixtures = [
      minimal,
      structure,
      branching,
      contentTypes,
      citations,
      persian,
      hostile,
      shardA,
      shardB,
    ];

    for (const fixture of fixtures) {
      expect(detect(fixture as unknown)).toBe(true);
    }
  });

  it('accepts the smallest possible shape: one element, one node', () => {
    expect(detect([conversation()])).toBe(true);
  });

  it('accepts a file whose other elements are damaged (FR-1, ADR-F)', () => {
    // Deliberately looser than the other three signatures: one unreadable
    // conversation must not make a whole real export undetectable.
    const mixed = [conversation(), 'not-an-object', { id: 'broken' }, 42];

    expect(detect(mixed)).toBe(true);
  });

  it('ignores nodes that carry no message', () => {
    const structural = [
      {
        id: 'c1',
        mapping: {
          root: { id: 'root', message: null, parent: null, children: ['n1'] },
          n1: { id: 'n1', message: chatgptMessage(), parent: 'root', children: [] },
        },
      },
    ];

    expect(detect(structural)).toBe(true);
  });

  it('rejects a mapping whose nodes only carry messages without the vocabulary', () => {
    const noVocabulary = [
      {
        id: 'c1',
        mapping: {
          n1: { id: 'n1', message: { model: 'gpt-5' }, parent: null, children: [] },
          n2: { id: 'n2', message: null, parent: null, children: [] },
        },
      },
    ];

    expect(detect(noVocabulary)).toBe(false);
  });

  it('requires a string author.role', () => {
    expect(detect([conversation({ mapping: { n1: { message: chatgptMessage({ author: {} }) } } })])).toBe(
      false,
    );
    expect(
      detect([conversation({ mapping: { n1: { message: chatgptMessage({ author: { role: 7 } }) } } })]),
    ).toBe(false);
  });

  it('requires a string content.content_type', () => {
    expect(
      detect([
        conversation({ mapping: { n1: { message: chatgptMessage({ content: { parts: ['x'] } }) } } }),
      ]),
    ).toBe(false);
    expect(
      detect([
        conversation({
          mapping: { n1: { message: chatgptMessage({ content: { content_type: 5 } }) } },
        }),
      ]),
    ).toBe(false);
  });

  it('rejects DeepSeek’s fragments marker anywhere in the file (file-wide, C8)', () => {
    const deepSeekNode = { message: { fragments: [{ type: 'REQUEST', content: 'hi' }] } };
    const withOneFragment = [
      conversation(),
      { id: 'c2', mapping: { n: deepSeekNode } },
    ];

    expect(detect([{ id: 'c2', mapping: { n: deepSeekNode } }])).toBe(false);
    // Even when a perfectly good ChatGPT element is present: a file mixing the
    // two vocabularies is not claimed here.
    expect(detect(withOneFragment)).toBe(false);
    // A present-but-null marker counts as present, not as absent.
    expect(
      detect([{ id: 'c2', mapping: { n: { message: chatgptMessage({ fragments: null }) } } }]),
    ).toBe(false);
  });

  it('rejects the registries’ other platform fixtures (AC9)', () => {
    expect(detect(deepseekSample as unknown)).toBe(false);
    expect(detect(claudeSample as unknown)).toBe(false);
    expect(detect(geminiSample as unknown)).toBe(false);
  });

  it('rejects the non-conversation JSON shipped with the shards', () => {
    expect(detect(manifest as unknown)).toBe(false);
  });

  it.each([
    ['an empty array', []],
    ['an array of numbers', [1, 2, 3]],
    ['an array of unrelated objects', [{ unrelated: true }]],
    ['a bare conversation', conversation()],
    ['a mapping-shaped object without the wrapper array', { mapping: {} }],
    ['null', null],
    ['a string', 'chatgpt'],
    ['a number', 42],
  ])('rejects %s', (_label, payload) => {
    expect(detect(payload)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { detect } from '@/parsers/gemini/detect';
// Synthetic fixture only: the real Gemini export stays local (see
// `context/fixtures/gemini/README.md`) and never enters the repository.
import sampleExport from '../fixtures/gemini/sample-export.json';

/**
 * Minimal valid Activity item, mirroring the fixture's essential fields.
 * `header`/`products`/`activityControls` are deliberately absent: they are the
 * fields FR9 ignores, so the signature must not depend on them.
 */
function activityItem(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: 'درخواست: سلام',
    time: '2025-03-01T14:20:00.000Z',
    details: [
      {
        name: 'https://gemini.google.com/app/abc123',
        url: 'https://gemini.google.com/app/abc123',
      },
    ],
    safeHtmlItem: [{ html: '<p>پاسخ</p>' }],
    ...overrides,
  };
}

describe('gemini detect', () => {
  it('accepts the shape-true synthetic export fixture', () => {
    expect(detect(sampleExport)).toBe(true);
  });

  it('accepts a minimal activity item (structure only, no timestamp)', () => {
    expect(detect([activityItem({ time: undefined })])).toBe(true);
  });

  it('rejects a DeepSeek-shaped mapping export (no Activity item)', () => {
    const deepSeekLike = [
      {
        id: 'c1',
        mapping: {
          '1': { message: { fragments: [{ type: 'REQUEST', content: 'hi' }] } },
        },
      },
    ];

    expect(detect(deepSeekLike)).toBe(false);
  });

  it('rejects a Claude-shaped conversation list (no details/safeHtmlItem)', () => {
    const claudeLike = [
      {
        uuid: 'conv-1',
        account: { uuid: 'acct-1' },
        chat_messages: [
          {
            uuid: 'msg-1',
            sender: 'human',
            content: [{ type: 'text', text: 'hi' }],
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
          },
        ],
      },
    ];

    expect(detect(claudeLike)).toBe(false);
  });

  it('rejects an item whose conversation key is missing or unreadable', () => {
    // `details[0].url` is the only conversation key the format has (FR2):
    // without it an item cannot be placed in a conversation, so it is not
    // this format.
    expect(detect([activityItem({ details: undefined })])).toBe(false);
    expect(detect([activityItem({ details: [] })])).toBe(false);
    expect(detect([activityItem({ details: [{ name: 'x' }] })])).toBe(false);
    expect(detect([activityItem({ details: 'url-string' })])).toBe(false);
  });

  it('rejects an item whose answer payload proves nothing', () => {
    // An absent or empty `safeHtmlItem` proves nothing about the format
    // (NFR1 degrades to "no answer recorded"); a present one must be readable.
    expect(detect([activityItem({ safeHtmlItem: undefined })])).toBe(false);
    expect(detect([activityItem({ safeHtmlItem: [] })])).toBe(false);
    expect(detect([activityItem({ safeHtmlItem: ['<p>x</p>'] })])).toBe(false);
    expect(detect([activityItem({ safeHtmlItem: [{ html: 42 }] })])).toBe(false);
  });

  it('rejects an item whose user text is missing', () => {
    expect(detect([activityItem({ title: undefined })])).toBe(false);
    expect(detect([activityItem({ title: 42 })])).toBe(false);
  });

  it('rejects when only some elements are Activity items', () => {
    expect(detect([activityItem(), { unrelated: true }])).toBe(false);
  });

  it.each([
    ['an empty array', []],
    ['an array of numbers', [1, 2, 3]],
    ['a bare object', activityItem()],
    ['null', null],
    ['a string', 'gemini'],
    ['a number', 42],
  ])('rejects %s', (_label, payload) => {
    expect(detect(payload)).toBe(false);
  });

  it('requires the array wrapper the real export uses, not a bare item', () => {
    // Guards against loosening the signature: structure alone decides (FR2).
    expect(detect(activityItem())).toBe(false);
    expect(detect([activityItem()])).toBe(true);
  });
});
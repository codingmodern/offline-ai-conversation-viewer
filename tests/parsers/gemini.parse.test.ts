import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/gemini/parse';
import type { GeminiRawConversation } from '@/parsers/gemini/types';
import sampleExport from '../fixtures/gemini/sample-export.json';

/**
 * Synthetic fixture only (`context/fixtures/gemini/README.md`): the real export
 * stays local, so these tests pin the parser against a shape-true synthetic
 * file whose layout reproduces the real one — a flat Activity array in
 * **reverse-chronological** order, grouped only by `details[0].url`.
 */

/** Parses the fixture and returns one conversation by index, failing loudly. */
function conversationAt(index: number): GeminiRawConversation {
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

/** One minimal Activity item for inline payloads. */
function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

describe('gemini parse — happy path', () => {
  it('parses the fixture and orders conversations ascending by earliest turn', () => {
    const parsed = parse(sampleExport);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.providerId).toBe('gemini');
    // The file lists conv-a → conv-d → conv-c → conv-b; the ids come from the
    // urls' last path segment, and the order is the timeline, not the file.
    expect(parsed.data.conversations.map((conversation) => conversation.id)).toEqual([
      'sample-conv-b',
      'sample-conv-c',
      'sample-conv-d',
      'sample-conv-a',
    ]);
  });

  it('re-sorts turns inside a conversation into reading order (the file is DESC)', () => {
    const convC = conversationAt(1);
    const convB = conversationAt(0);

    expect(convC.turns.map((turn) => turn.time)).toEqual([
      '2025-03-02T08:00:00.000Z',
      '2025-03-02T08:05:00.000Z',
    ]);
    expect(convB.turns.map((turn) => turn.time)).toEqual([
      '2025-03-01T14:20:00.000Z',
      '2025-03-01T14:30:00.000Z',
    ]);
  });

  it('keeps every draft of a multi-draft turn, in export order (ADR #25)', () => {
    // The only dual-draft turn of the fixture: one turn, two answers.
    const convB = conversationAt(0);
    const dualDraft = convB.turns[1];

    expect(dualDraft?.drafts).toHaveLength(2);
    expect(dualDraft?.drafts[0]).toContain('هر دو پیش‌نویس');
    expect(dualDraft?.drafts[1]).toContain('پیش‌نویس جایگزین');
  });

  it('keeps user text, attachments and the image reference verbatim (FR4/FR8)', () => {
    const convC = conversationAt(1);

    expect(convC.turns[0]).toMatchObject({
      title: 'درخواست: این تصویر را بررسی کن',
      attachedFiles: ['shot-01.jpg'],
      imageFile: 'shot-01.jpg',
      drafts: ['<p>تصویر را دیدم و <strong>نکته‌ی مهم</strong> را برجسته کردم.</p>'],
    });
    // A generated image: `attachedFiles` without `imageFile` — the export's own
    // discriminator between the two attachment situations (EC4).
    expect(convC.turns[1]).toMatchObject({
      attachedFiles: ['poster-42.png'],
      drafts: ['<p>تصویر ساخته شد.</p>'],
    });
    expect(convC.turns[1]).not.toHaveProperty('imageFile');
  });

  it('degrades an item without an answer payload to a turn with no drafts (NFR1)', () => {
    const parsed = parse([item({ safeHtmlItem: undefined })]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.conversations[0]?.turns[0]?.drafts).toEqual([]);
  });

  it('keeps undated turns after the dated ones, in file order', () => {
    const parsed = parse([
      item({ title: 'درخواست: بدون زمان' }),
      item({ time: '2025-03-01T10:00:00.000Z', title: 'درخواست: زمان‌دار' }),
      item({ time: 'not-a-date', title: 'درخواست: زمان خراب' }),
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const turns = parsed.data.conversations[0]?.turns;
    // A value the export did not timestamp (or that cannot be parsed) cannot be
    // placed on the timeline: nothing is invented for it, nothing is dropped.
    expect(turns?.map((turn) => turn.title)).toEqual([
      'درخواست: زمان‌دار',
      'درخواست: بدون زمان',
      'درخواست: زمان خراب',
    ]);
  });

  it('never throws on hostile input', () => {
    expect(() => parse(undefined)).not.toThrow();
    expect(() => parse([null])).not.toThrow();
    expect(() => parse('gemini')).not.toThrow();
  });
});

describe('gemini parse — typed failures (FR6)', () => {
  it('rejects a root that is not an array of Activity items', () => {
    const parsed = parse({ not: 'an array' });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects an export with no activity items', () => {
    const parsed = parse([]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects an item without the conversation key', () => {
    const missing = parse([item({ details: undefined })]);
    const empty = parse([item({ details: [] })]);

    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('MissingFieldError');
    }
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe('MissingFieldError');
    }
  });

  it('rejects an item whose user text is absent or mistyped', () => {
    const absent = parse([item({ title: undefined })]);
    const mistyped = parse([item({ title: 42 })]);

    expect(absent.ok).toBe(false);
    if (!absent.ok) {
      expect(absent.error.code).toBe('MissingFieldError');
    }
    expect(mistyped.ok).toBe(false);
    if (!mistyped.ok) {
      expect(mistyped.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects a draft entry that is not `{ html: string }`', () => {
    const parsed = parse([item({ safeHtmlItem: [{ html: '<p>ok</p>' }, 'nope'] })]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects an attachment list entry that is not a string', () => {
    const parsed = parse([item({ attachedFiles: [42] })]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });

  it('rejects an optional field that is present with the wrong type', () => {
    // Absent is fine; present-but-mistyped is format drift and is reported.
    const parsed = parse([item({ imageFile: 42 })]);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('UnexpectedTypeError');
    }
  });
});
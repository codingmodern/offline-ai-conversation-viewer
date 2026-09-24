import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/gemini/parse';
import { normalizeGemini, TITLE_MAX_LENGTH } from '@/normalization/gemini';
import type { UnifiedConversation } from '@/types/conversation';
import sampleExport from '../fixtures/gemini/sample-export.json';

/**
 * Gemini's Activity → unified-message mapping, pinned against the synthetic
 * fixture (the real export stays local — `context/fixtures/gemini/README.md`).
 */

function normalizeFixture(): readonly UnifiedConversation[] {
  const parsed = parse(sampleExport);
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code}`);
  }
  return normalizeGemini(parsed.data);
}

function conversationAt(index: number): UnifiedConversation {
  const conversation = normalizeFixture()[index];
  if (conversation === undefined) {
    throw new Error(`fixture must normalize to conversation ${String(index)}`);
  }
  return conversation;
}

describe('normalizeGemini — conversation level', () => {
  it('maps the export onto the unified model with a derived title (ADR #24)', () => {
    const conversation = conversationAt(0);

    expect(conversation.sourceProvider).toBe('gemini');
    expect(conversation.sourceConversationId).toBe('sample-conv-b');
    // No conversation title exists in this export: the first user message
    // becomes it, truncated by the single project-wide rule.
    expect(conversation.title).toBeDefined();
    const title = Array.from(conversation.title ?? '');
    expect(title).toHaveLength(TITLE_MAX_LENGTH + 1);
    expect(conversation.title?.endsWith('…')).toBe(true);
    // The prefix is a display artifact, never part of the title.
    expect(conversation.title?.startsWith('درخواست:')).toBe(false);
    // Conversation bounds are the earliest/latest turn times, verbatim (ADR #26).
    expect(conversation.createdAt).toBe('2025-03-01T14:20:00.000Z');
    expect(conversation.updatedAt).toBe('2025-03-01T14:30:00.000Z');
  });

  it('derives the title from the first non-empty user message, prefix stripped', () => {
    const conversation = conversationAt(1);

    expect(conversation.sourceConversationId).toBe('sample-conv-c');
    expect(conversation.title).toBe('این تصویر را بررسی کن');
  });

  it('keeps an unprefixed title whole (defensive fallback, EC5)', () => {
    const conversation = conversationAt(3);

    expect(conversation.sourceConversationId).toBe('sample-conv-a');
    expect(conversation.title).toBe('Hello there');
  });

  it('produces sequential, gap-free order values', () => {
    for (const conversation of normalizeFixture()) {
      expect(conversation.messages.map((message) => message.order)).toEqual(
        conversation.messages.map((_, index) => index),
      );
    }
  });
});

describe('normalizeGemini — one turn is one user message plus one answer', () => {
  it('maps the turn vocabulary onto roles and fragment types', () => {
    const conversation = conversationAt(3);

    expect(
      conversation.messages.map((message) => [
        message.sourceFragmentType,
        message.kind,
        message.role,
      ]),
    ).toEqual([
      ['title', 'text', 'user'],
      ['safeHtmlItem', 'text', 'assistant'],
    ]);
  });

  it('strips the prefix from the user text and keeps the answer HTML verbatim (FR4/FR7)', () => {
    const conversation = conversationAt(2);

    expect(conversation.messages[0]).toMatchObject({
      role: 'user',
      kind: 'text',
      content: 'کوتاه',
      createdAt: '2025-03-02T08:02:00.000Z',
    });
    expect(conversation.messages[1]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      content: '<p>پاسخ کوتاه.</p>',
      createdAt: '2025-03-02T08:02:00.000Z',
    });
    // ADR #26: the turn's single time lands on both of its messages verbatim.
    expect(conversation.messages[0]?.createdAt).toBe(conversation.messages[1]?.createdAt);
  });

  it('omits `alternatives` entirely when a turn has a single answer', () => {
    const conversation = conversationAt(3);

    expect(conversation.messages[1]).not.toHaveProperty('alternatives');
  });

  it('produces a turn-less answer as no message at all rather than an empty one', () => {
    const parsed = parse([
      {
        title: 'درخواست: بی‌پاسخ',
        details: [{ url: 'https://gemini.google.com/app/no-answer' }],
      },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeGemini(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');

    expect(conversation.messages.map((message) => message.role)).toEqual(['user']);
  });
});

describe('normalizeGemini — extra drafts and attachments', () => {
  it('keeps extra drafts as alternatives of ONE assistant message (ADR #25)', () => {
    const conversation = conversationAt(0);
    // The dual-draft turn is the conversation's second one; the first turn
    // answers once, so the selector is "carries alternatives", not "is an
    // assistant message" (the conversation legitimately has two of those).
    const answers = conversation.messages.filter(
      (message) => message.alternatives !== undefined,
    );

    // AC1 requires one answer per turn, so the second draft must never become a
    // second message — it travels in `alternatives` instead.
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      content: '<p>بله، هر دو پیش‌نویس در خروجی ثبت می‌شوند.</p>',
      alternatives: [
        '<p>در خروجی فقط پاسخ‌های ثبت‌شده می‌آیند؛ پیش‌نویس جایگزین جداگانه نشان داده می‌شود.</p>',
      ],
    });
  });

  it('attaches an uploaded file to the user, a generated one to the assistant', () => {
    const conversation = conversationAt(1);

    expect(
      conversation.messages.map((message) => [
        message.role,
        message.kind,
        message.sourceFragmentType,
      ]),
    ).toEqual([
      ['user', 'text', 'title'],
      ['assistant', 'text', 'safeHtmlItem'],
      ['user', 'attachment', 'attachedFiles'], // the uploaded image (EC3)
      ['user', 'text', 'title'],
      ['assistant', 'text', 'safeHtmlItem'],
      ['assistant', 'attachment', 'attachedFiles'], // the generated image (EC4)
    ]);
  });

  it('carries the file names verbatim, with no invented size', () => {
    const conversation = conversationAt(1);
    const attachments = conversation.messages
      .filter((message) => message.kind === 'attachment')
      .flatMap((message) => message.attachments ?? []);

    expect(attachments).toEqual([
      { fileId: 'shot-01.jpg', fileName: 'shot-01.jpg' },
      { fileId: 'poster-42.png', fileName: 'poster-42.png' },
    ]);
    for (const attachment of attachments) {
      expect(attachment).not.toHaveProperty('fileSize');
    }
  });

  it('appends an `imageFile` the attachment list does not already carry', () => {
    const parsed = parse([
      {
        title: 'درخواست: پیوست',
        details: [{ url: 'https://gemini.google.com/app/img-only' }],
        imageFile: 'only-image.png',
        safeHtmlItem: [{ html: '<p>x</p>' }],
      },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeGemini(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');
    const attachment = conversation.messages.find((message) => message.kind === 'attachment');

    expect(attachment?.attachments).toEqual([
      { fileId: 'only-image.png', fileName: 'only-image.png' },
    ]);
  });
});

describe('normalizeGemini — edge cases', () => {
  it('keeps an empty user text empty and derives no title from it', () => {
    const parsed = parse([
      {
        title: '',
        details: [{ url: 'https://gemini.google.com/app/empty-title' }],
        safeHtmlItem: [{ html: '<p>x</p>' }],
      },
      {
        title: 'درخواست: سوال واقعی',
        details: [{ url: 'https://gemini.google.com/app/empty-title' }],
        safeHtmlItem: [{ html: '<p>y</p>' }],
      },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeGemini(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');

    // The empty text stays empty (no error, no placeholder text), and the
    // conversation title skips it for the first message that has text.
    expect(conversation.messages[0]?.content).toBe('');
    expect(conversation.title).toBe('سوال واقعی');
  });

  it('gives a conversation with no user text at all no title', () => {
    const parsed = parse([
      {
        title: '',
        details: [{ url: 'https://gemini.google.com/app/no-text' }],
        safeHtmlItem: [{ html: '<p>x</p>' }],
      },
    ]);
    if (!parsed.ok) throw new Error('must parse');

    const [conversation] = normalizeGemini(parsed.data);
    if (conversation === undefined) throw new Error('must normalize');

    expect(conversation.title).toBeUndefined();
  });
});
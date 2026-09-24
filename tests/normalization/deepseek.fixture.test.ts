import { describe, expect, it } from 'vitest';
import { parse } from '@/parsers/deepseek/parse';
import { normalizeDeepSeek } from '@/normalization/deepseek';
import type { UnifiedConversation } from '@/types/conversation';
import sampleReal from '../fixtures/deepseek/sample-real.json';
import sampleRich from '../fixtures/deepseek/sample-rich.json';

/**
 * End-to-end over real anonymized fixtures: `parse()` → `normalizeDeepSeek()`.
 *
 * The unit suites cover each layer in isolation with hand-built input; these cases
 * prove the two layers agree on a whole file, which is exactly where the original
 * bug lived — `parse()` rejected fragments the unified model can represent
 * perfectly well.
 */
function normalizeFixture(fixture: unknown): readonly UnifiedConversation[] {
  const parsed = parse(fixture);
  // A parse failure here *is* the bug this file guards against, so surface it
  // rather than silently asserting on an empty result.
  if (!parsed.ok) {
    throw new Error(`fixture failed to parse: ${parsed.error.code} — ${parsed.error.detail ?? ''}`);
  }
  return normalizeDeepSeek(parsed.data);
}

describe('deepseek fixture → unified model', () => {
  it('imports the plain REQUEST/RESPONSE fixture unchanged in meaning', () => {
    const [conversation] = normalizeFixture(sampleReal);

    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    // Text is the only kind in this fixture — no attachment or tool step exists.
    expect(new Set(conversation?.messages.map((message) => message.kind))).toEqual(
      new Set(['text']),
    );
  });

  it('reports the real export updatedAt, which is later than its newest message', () => {
    // ADR #8 proved on real data: the fixture's conversation-level `updated_at`
    // (23:25:55.182) is later than its newest `inserted_at` (23:25:52.537), so a
    // recomputed value would visibly differ from what DeepSeek recorded.
    const [conversation] = normalizeFixture(sampleReal);

    expect(conversation?.updatedAt).toBe('2026-08-20T23:25:55.182000+08:00');
    expect(conversation?.createdAt).toBe('2026-08-20T23:23:45.861000+08:00');

    const newestMessage = conversation?.messages
      .map((message) => message.createdAt)
      .filter((value): value is string => value !== undefined)
      .sort()
      .at(-1);
    expect(newestMessage).toBe('2026-08-20T23:25:52.537000+08:00');
    expect(conversation?.updatedAt).not.toBe(newestMessage);
  });

  it('imports an export containing all eight fragment types', () => {
    // Before the per-category rule this threw MissingFieldError on the first FILE.
    const [conversation] = normalizeFixture(sampleRich);

    expect(conversation?.messages).toHaveLength(12);
    expect(conversation?.sourceConversationId).toBe('aa11bb22-cc33-dd44-ee55-ff6677889900');
  });

  it('assigns the documented kind and role to every fragment type', () => {
    const [conversation] = normalizeFixture(sampleRich);

    expect(
      conversation?.messages.map((message) => [
        message.sourceFragmentType,
        message.kind,
        message.role,
      ]),
    ).toEqual([
      // Attachment sent with the user's first question.
      ['FILE', 'attachment', 'user'],
      ['REQUEST', 'text', 'user'],
      // Reasoning is assistant text, distinguished only by the raw type.
      ['THINK', 'text', 'assistant'],
      ['RESPONSE', 'text', 'assistant'],
      ['REQUEST', 'text', 'user'],
      ['SEARCH', 'tool_activity', 'assistant'],
      ['TOOL_SEARCH', 'tool_activity', 'assistant'],
      ['TOOL_OPEN', 'tool_activity', 'assistant'],
      ['TOOL_FIND', 'tool_activity', 'assistant'],
      ['THINK', 'text', 'assistant'],
      ['RESPONSE', 'text', 'assistant'],
      // Attachment in an assistant turn inherits that turn's role.
      ['FILE', 'attachment', 'assistant'],
    ]);
  });

  it('maps attachment payloads from the export, inventing no values', () => {
    const [conversation] = normalizeFixture(sampleRich);
    const attachments = conversation?.messages
      .filter((message) => message.kind === 'attachment')
      .flatMap((message) => message.attachments ?? []);

    expect(attachments).toEqual([
      { fileId: 'file-0000000000000001', fileName: 'placeholder-document.pdf', fileSize: 12345 },
      { fileId: 'file-0000000000000002', fileName: 'placeholder-image.png', fileSize: 67890 },
      { fileId: 'file-0000000000000003', fileName: 'placeholder-notes.txt', fileSize: 4096 },
    ]);
  });

  it('keeps tool results verbatim and omits them where the export has none', () => {
    const [conversation] = normalizeFixture(sampleRich);
    const activity = conversation?.messages
      .filter((message) => message.kind === 'tool_activity')
      .map((message) => message.toolActivity);

    expect(activity).toEqual([
      {
        activityType: 'SEARCH',
        results: [{ title: 'Placeholder result', url: 'https://example.invalid/a' }],
      },
      {
        activityType: 'TOOL_SEARCH',
        results: [{ title: 'Placeholder result', url: 'https://example.invalid/b' }],
      },
      // No `results` key at all for these two — nothing is fabricated.
      { activityType: 'TOOL_OPEN' },
      { activityType: 'TOOL_FIND' },
    ]);
  });

  it('gives every message exactly the payload its kind implies', () => {
    const [conversation] = normalizeFixture(sampleRich);

    for (const message of conversation?.messages ?? []) {
      if (message.kind === 'text') {
        expect(typeof message.content).toBe('string');
        expect(message).not.toHaveProperty('attachments');
        expect(message).not.toHaveProperty('toolActivity');
      } else if (message.kind === 'attachment') {
        expect(message.attachments?.length).toBeGreaterThan(0);
        expect(message).not.toHaveProperty('content');
        expect(message).not.toHaveProperty('toolActivity');
      } else {
        expect(message.toolActivity?.activityType).toBe(message.sourceFragmentType);
        expect(message).not.toHaveProperty('content');
        expect(message).not.toHaveProperty('attachments');
      }
    }
  });

  it('orders messages 0..n-1 across every kind', () => {
    const [conversation] = normalizeFixture(sampleRich);

    // Attachments and tool steps occupy positions like any other message, so
    // nothing is silently reordered or skipped.
    expect(conversation?.messages.map((message) => message.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});

/**
 * Regression: anonymized shapes matching the FILE / SEARCH / TOOL_OPEN fragments
 * of the real 2026-08-20 export that failed to import.
 *
 * File names, ids and result payloads are placeholders — only the *structure*
 * reproduces the bug, so no real user data lives in the test suite.
 */
describe('regression: real export blocked by a universal content check', () => {
  const failingExport = [
    {
      id: '00000000-0000-4000-8000-000000000000',
      title: 'Placeholder title',
      inserted_at: '2026-08-20T23:23:45.861000+08:00',
      updated_at: '2026-08-20T23:25:55.182000+08:00',
      mapping: {
        root: { id: 'root', parent: null, children: ['1'], message: null },
        '1': {
          id: '1',
          parent: 'root',
          children: ['2'],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2026-08-20T23:24:36.688000+08:00',
            fragments: [
              {
                type: 'FILE',
                files: [
                  {
                    file_id: 'file-0000000000000009',
                    file_name: 'placeholder-attachment.pdf',
                    file_size: 54321,
                  },
                ],
              },
              { type: 'REQUEST', content: 'Placeholder question' },
            ],
          },
        },
        '2': {
          id: '2',
          parent: '1',
          children: [],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2026-08-20T23:24:36.682000+08:00',
            fragments: [
              { type: 'SEARCH', results: [{ title: 'Placeholder', url: 'https://x.invalid' }] },
              { type: 'TOOL_OPEN' },
              { type: 'RESPONSE', content: 'Placeholder answer' },
            ],
          },
        },
      },
    },
  ];

  it('imports instead of failing with MissingFieldError', () => {
    const parsed = parse(failingExport);

    // The exact failure that blocked the real file: `content` was required on
    // FILE/SEARCH/TOOL_OPEN fragments that never carry it.
    expect(parsed.ok).toBe(true);
    if (parsed.ok) return;
    expect(parsed.error.code).not.toBe('MissingFieldError');
  });

  it('preserves all five fragments, dropping none of them', () => {
    const [conversation] = normalizeFixture(failingExport);

    expect(conversation?.messages.map((message) => message.sourceFragmentType)).toEqual([
      'FILE',
      'REQUEST',
      'SEARCH',
      'TOOL_OPEN',
      'RESPONSE',
    ]);
  });

  it('renders each of them as a usable unified message', () => {
    const [conversation] = normalizeFixture(failingExport);
    const [file, request, search, toolOpen] = conversation?.messages ?? [];

    expect(file).toMatchObject({
      role: 'user',
      kind: 'attachment',
      attachments: [
        {
          fileId: 'file-0000000000000009',
          fileName: 'placeholder-attachment.pdf',
          fileSize: 54321,
        },
      ],
    });
    expect(request).toMatchObject({ role: 'user', kind: 'text', content: 'Placeholder question' });
    expect(search).toMatchObject({
      role: 'assistant',
      kind: 'tool_activity',
      toolActivity: {
        activityType: 'SEARCH',
        results: [{ title: 'Placeholder', url: 'https://x.invalid' }],
      },
    });
    expect(toolOpen?.toolActivity).toEqual({ activityType: 'TOOL_OPEN' });
  });
});

import { describe, expect, it } from 'vitest';
import type { ChatGptRawData, ChatGptRawMessage } from '@/parsers/chatgpt/types';
import type { UnifiedConversation } from '@/types/conversation';
import { CHATGPT_ATTACHMENT_PLACEHOLDER, normalizeChatGpt } from '@/normalization/chatgpt';
import { isStorableConversation } from '@/storage/validateConversation';

/** One raw message with every optional field the parser may omit. */
function rawMessage(overrides: Partial<ChatGptRawMessage> = {}): ChatGptRawMessage {
  const contentType = overrides.contentType ?? 'text';
  const parts = overrides.parts ?? ['سلام'];

  return {
    role: 'user',
    recipient: 'all',
    contentType,
    parts,
    thoughts: [],
    hiddenFromConversation: false,
    rawContent: { content_type: contentType, parts },
    attachments: [],
    ...overrides,
  };
}

/** Fields a raw conversation may carry beyond its id and messages. */
interface RawConversationOverrides {
  readonly id?: string;
  readonly title?: string;
  readonly createTime?: number;
  readonly updateTime?: number;
  readonly defaultModelSlug?: string;
}

function rawData(
  messages: readonly ChatGptRawMessage[],
  overrides: RawConversationOverrides = {},
): ChatGptRawData {
  return {
    providerId: 'chatgpt',
    conversations: [
      {
        id: overrides.id ?? 'c1',
        ...(overrides.title === undefined ? {} : { title: overrides.title }),
        ...(overrides.createTime === undefined ? {} : { createTime: overrides.createTime }),
        ...(overrides.updateTime === undefined ? {} : { updateTime: overrides.updateTime }),
        ...(overrides.defaultModelSlug === undefined
          ? {}
          : { defaultModelSlug: overrides.defaultModelSlug }),
        messages,
      },
    ],
    skipped: [],
  };
}

function firstConversation(data: ChatGptRawData): UnifiedConversation {
  const [conversation] = normalizeChatGpt(data);
  if (conversation === undefined) {
    throw new Error('must normalize to one conversation');
  }
  return conversation;
}

describe('chatgpt normalization — roles (FR-6)', () => {
  it('maps user→user and assistant/tool→assistant, and never guesses the rest', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({ role: 'user' }),
        rawMessage({ role: 'assistant', parts: ['پاسخ'] }),
        rawMessage({ role: 'tool', parts: ['خروجی ابزار'] }),
        rawMessage({ role: 'developer', parts: ['نقش ناشناخته'] }),
      ]),
    );

    expect(conversation.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
      'unknown',
    ]);
    // Every message keeps its verbatim source type alongside the mapping.
    expect(conversation.messages.map((message) => message.sourceFragmentType)).toEqual([
      'text',
      'text',
      'text',
      'text',
    ]);
  });

  it('keeps tool traffic assistant-side without turning it into text', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'tool',
          authorName: 'python',
          contentType: 'execution_output',
          parts: [],
          text: 'خروجی',
          rawContent: { content_type: 'execution_output', text: 'خروجی' },
        }),
      ]),
    );

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.kind).toBe('tool_activity');
    expect(conversation.messages[0]?.role).toBe('assistant');
  });
});

describe('chatgpt normalization — FR-5 visibility', () => {
  it('hides system messages, weight 0, visually hidden and context types', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({ role: 'system', parts: ['سیستمی'] }),
        rawMessage({ weight: 0, parts: ['وزن صفر'] }),
        rawMessage({ hiddenFromConversation: true, parts: ['پنهان'] }),
        rawMessage({ contentType: 'user_editable_context', parts: ['دستور سفارشی'] }),
        rawMessage({ contentType: 'model_editable_context', parts: ['حافظه'] }),
        rawMessage({ parts: ['قابل نمایش'] }),
      ]),
    );

    expect(conversation.messages.map((message) => message.content)).toEqual(['قابل نمایش']);
  });

  it('lists a fully hidden conversation instead of dropping it', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ role: 'system', parts: ['سیستمی'] })]),
    );

    expect(conversation.messages).toEqual([]);
    // The whole point of keeping it: the library stores empty conversations and
    // lists them with an empty state (spec 11 → Edge Cases).
    expect(isStorableConversation(conversation)).toBe(true);
  });

  it('emits no row for a message with nothing left after extraction', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ parts: [] }), rawMessage({ parts: ['هستم'] })]),
    );

    expect(conversation.messages).toHaveLength(1);
  });
});

describe('chatgpt normalization — text and multimodal payloads (FR-6)', () => {
  it('maps a plain text message onto one text message', () => {
    const conversation = firstConversation(rawData([rawMessage({ parts: ['سلام'] })]));

    expect(conversation.messages[0]).toMatchObject({
      kind: 'text',
      role: 'user',
      content: 'سلام',
      sourceFragmentType: 'text',
      order: 0,
    });
  });

  it('splits a multimodal message into text + attachment, in source order (FR-6)', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'multimodal_text',
          parts: [
            'این تصویر است',
            {
              content_type: 'image_asset_pointer',
              asset_pointer: 'file-service://file-abc',
              width: 1024,
              height: 1024,
            },
          ],
        }),
      ]),
    );

    expect(conversation.messages.map((message) => message.kind)).toEqual(['text', 'attachment']);
    expect(conversation.messages[0]?.content).toBe('این تصویر است');
    expect(conversation.messages[1]?.attachments).toEqual([
      { fileId: 'file-service://file-abc', fileName: CHATGPT_ATTACHMENT_PLACEHOLDER },
    ]);
    expect(conversation.messages[1]?.sourceFragmentType).toBe('image_asset_pointer');
    expect(conversation.messages[1]?.role).toBe('assistant');
  });

  it('keeps a placeholder message for an object part that is not an image pointer', () => {
    const part = { content_type: 'audio_transcript', text: '…' };
    const conversation = firstConversation(rawData([rawMessage({ parts: [part] })]));

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      kind: 'text',
      sourceFragmentType: 'audio_transcript',
      sourceFragment: part,
    });
    expect(conversation.messages[0]).not.toHaveProperty('content');
  });

  it('treats a pointer part without a pointer string as a placeholder, not an id', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ parts: [{ content_type: 'image_asset_pointer', width: 10 }] })]),
    );

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.sourceFragmentType).toBe('image_asset_pointer');
    expect(conversation.messages[0]).not.toHaveProperty('attachments');
  });

  it('never reads parts[0]: text may come from content.text instead (FR-6)', () => {
    const fromText = firstConversation(rawData([rawMessage({ parts: [], text: 'از فیلد text' })]));
    expect(fromText.messages[0]?.content).toBe('از فیلد text');

    const fromResult = firstConversation(
      rawData([
        rawMessage({
          parts: [],
          result: 'از result',
          rawContent: { content_type: 'text', result: 'از result' },
        }),
      ]),
    );
    expect(fromResult.messages[0]?.content).toBe('از result');
  });
});

describe('chatgpt normalization — reasoning (FR-6, ADR-G)', () => {
  it('normalizes thoughts as assistant text with the verbatim type', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'thoughts',
          parts: [],
          thoughts: [
            { summary: 'بررسی', content: 'ابتدا فایل را می‌خوانم' },
            { summary: 'نتیجه‌گیری' },
            'متن ساده',
          ],
        }),
      ]),
    );

    const [message] = conversation.messages;
    expect(message).toMatchObject({
      kind: 'text',
      role: 'assistant',
      sourceFragmentType: 'thoughts',
    });
    expect(message?.content).toBe('ابتدا فایل را می‌خوانم\nنتیجه‌گیری\nمتن ساده');
  });

  it('normalizes reasoning_recap from its text field', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'reasoning_recap',
          text: 'خلاصه‌ی استدلال',
          parts: [],
        }),
      ]),
    );

    expect(conversation.messages[0]).toMatchObject({
      kind: 'text',
      role: 'assistant',
      content: 'خلاصه‌ی استدلال',
      sourceFragmentType: 'reasoning_recap',
    });
  });

  it('drops an empty reasoning message instead of rendering a blank block', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ role: 'assistant', contentType: 'thoughts', parts: [], thoughts: [] })]),
    );

    expect(conversation.messages).toEqual([]);
  });

  it('keeps a commentary-channel assistant message distinguishable (ADR-G)', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ role: 'assistant', channel: 'commentary', parts: ['در حال بررسی…'] })]),
    );

    expect(conversation.messages[0]).toMatchObject({
      kind: 'text',
      role: 'assistant',
      content: 'در حال بررسی…',
      // The channel value, not an invented label — 11b decides the presentation.
      sourceFragmentType: 'commentary',
    });
  });
});

describe('chatgpt normalization — tool activity (FR-6)', () => {
  it('maps code onto the invocation (toolInput)', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({ role: 'assistant', contentType: 'code', parts: [], text: 'print("hi")' }),
      ]),
    );

    expect(conversation.messages[0]).toMatchObject({
      kind: 'tool_activity',
      toolActivity: { activityType: 'code', toolInput: 'print("hi")' },
    });
    expect(conversation.messages[0]).not.toHaveProperty('content');
  });

  it('maps the output content types onto toolOutput', () => {
    for (const contentType of ['execution_output', 'computer_output', 'tether_browsing_display']) {
      const conversation = firstConversation(
        rawData([rawMessage({ role: 'assistant', contentType, parts: [], text: 'خروجی' })]),
      );

      expect(conversation.messages[0]?.toolActivity).toMatchObject({
        activityType: contentType,
        toolOutput: 'خروجی',
      });
    }
  });

  it('names the tool from the author name, then the recipient', () => {
    const byAuthor = firstConversation(
      rawData([
        rawMessage({ role: 'tool', authorName: 'python', contentType: 'code', parts: [], text: 'x' }),
      ]),
    );
    expect(byAuthor.messages[0]?.toolActivity).toMatchObject({ toolName: 'python' });

    const byRecipient = firstConversation(
      rawData([
        rawMessage({ role: 'assistant', recipient: 'dalle', parts: ['{"prompt":"a cat"}'] }),
      ]),
    );
    expect(byRecipient.messages[0]?.toolActivity).toMatchObject({
      activityType: 'text',
      toolName: 'dalle',
      toolInput: '{"prompt":"a cat"}',
    });

    const unnamed = firstConversation(
      rawData([rawMessage({ role: 'assistant', contentType: 'code', parts: [], text: 'x' })]),
    );
    expect(unnamed.messages[0]?.toolActivity).not.toHaveProperty('toolName');
  });

  it('shows a tool-only message as activity, not as empty text', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ role: 'assistant', contentType: 'code', parts: [] })]),
    );

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.kind).toBe('tool_activity');
    expect(conversation.messages[0]?.toolActivity).toEqual({ activityType: 'code' });
  });

  it('attaches the message attachments after the activity row', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'code',
          parts: [],
          text: 'x',
          attachments: [{ fileId: 'f-1', fileName: 'result.csv', fileSize: 3 }],
        }),
      ]),
    );

    expect(conversation.messages.map((message) => message.kind)).toEqual([
      'tool_activity',
      'attachment',
    ]);
    expect(conversation.messages[1]?.attachments).toEqual([
      { fileId: 'f-1', fileName: 'result.csv', fileSize: 3 },
    ]);
  });
});

describe('chatgpt normalization — unknown types (FR-6)', () => {
  it('preserves an unknown content type verbatim in sourceFragment', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ role: 'assistant', contentType: 'super_widget', parts: [] })]),
    );

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      kind: 'text',
      role: 'assistant',
      sourceFragmentType: 'super_widget',
      sourceFragment: { content_type: 'super_widget', parts: [] },
    });
    expect(conversation.messages[0]).not.toHaveProperty('content');
  });

  it('still attaches image pointers carried by an unknown message', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'mystery_card',
          parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://x' }],
        }),
      ]),
    );

    expect(conversation.messages.map((message) => message.kind)).toEqual(['text', 'attachment']);
    expect(conversation.messages[1]?.attachments?.[0]?.fileId).toBe('sediment://x');
  });
});

describe('chatgpt normalization — citation cleanup (FR-7, ADR-E)', () => {
  it('removes private-use spans and bracket markers from message text', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ parts: ['متن \uE200cite\uE201 ادامه', '【filecite】پایان'] })]),
    );

    expect(conversation.messages[0]?.content).toBe('متن  ادامه\nپایان');
  });

  it('removes entity markers too, with the documented name-loss limitation', () => {
    const conversation = firstConversation(rawData([rawMessage({ parts: ['نام \uE200entity\uE201 مهم'] })]));

    expect(conversation.messages[0]?.content).toBe('نام  مهم');
  });

  it('leaves a tool’s input verbatim — cleanup is message text only', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'code',
          parts: [],
          text: 'print("\uE200cite\uE201")',
        }),
      ]),
    );

    expect(conversation.messages[0]?.toolActivity?.toolInput).toBe('print("\uE200cite\uE201")');
  });

  it('leaves ZWNJ and mixed-direction text untouched', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ parts: ['می‌شود و نمی‌شود — English mixed'] })]),
    );

    expect(conversation.messages[0]?.content).toBe('می‌شود و نمی‌شود — English mixed');
  });
});

describe('chatgpt normalization — times (FR-9, ADR-I)', () => {
  it('converts Unix seconds to one ISO-8601 UTC string', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ createTime: 1750000000.123 })], { createTime: 1750000100.456 }),
    );

    const createdAt = conversation.messages[0]?.createdAt;
    expect(createdAt).toBe(new Date(1750000000123).toISOString());
    expect(createdAt?.endsWith('Z')).toBe(true);
    expect(conversation.createdAt).toBe(new Date(1750000100456).toISOString());
  });

  it('falls back to the conversation create_time for an untimed message', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ parts: ['بی‌زمان'] })], { createTime: 1750000100.456 }),
    );

    expect(conversation.messages[0]?.createdAt).toBe(new Date(1750000100456).toISOString());
  });

  it('omits non-finite and out-of-range times instead of throwing or clamping', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ createTime: 1e300 })], { createTime: 1e300, updateTime: Number.NaN }),
    );

    expect(conversation.messages[0]).not.toHaveProperty('createdAt');
    expect(conversation).not.toHaveProperty('createdAt');
    expect(conversation).not.toHaveProperty('updatedAt');
  });
});

describe('chatgpt normalization — metadata, ordering, determinism', () => {
  it('keeps a missing or empty title absent (FR-9)', () => {
    expect(firstConversation(rawData([rawMessage({})], { title: 'عنوان' })).title).toBe('عنوان');
    expect(firstConversation(rawData([rawMessage({})])).title).toBeUndefined();
    expect(firstConversation(rawData([rawMessage({})], { title: '' })).title).toBeUndefined();
  });

  it('carries the per-message model slug and never aggregates it (ADR #15)', () => {
    const conversation = firstConversation(
      rawData([rawMessage({ modelSlug: 'gpt-5' })], { defaultModelSlug: 'gpt-5' }),
    );

    expect(conversation.messages[0]?.model).toBe('gpt-5');
    // The shared model has no conversation-level model field by design.
    expect(conversation).not.toHaveProperty('model');
  });

  it('assigns order positionally over the emitted messages', () => {
    const conversation = firstConversation(
      rawData([
        rawMessage({
          role: 'assistant',
          contentType: 'multimodal_text',
          parts: [
            'متن',
            { content_type: 'image_asset_pointer', asset_pointer: 'sediment://x' },
          ],
        }),
        rawMessage({ parts: ['دوم'] }),
      ]),
    );

    expect(conversation.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(conversation.messages.map((message) => message.kind)).toEqual([
      'text',
      'attachment',
      'text',
    ]);
  });

  it('is deterministic: the same raw data produces the same conversations', () => {
    const data = rawData([rawMessage({ role: 'assistant', parts: ['پاسخ'] })], { title: 'ت' });

    expect(normalizeChatGpt(data)).toEqual(normalizeChatGpt(data));
  });
});
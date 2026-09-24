import { describe, expect, it } from 'vitest';
import { parseConversations } from '@/parsers/parseConversations';
import { PROVIDER_MODULES } from '@/detection/registry';
import { detectProvider } from '@/detection/detectProvider';
import sampleReal from '../fixtures/deepseek/sample-real.json';
import sampleRich from '../fixtures/deepseek/sample-rich.json';
import claudeSample from '../fixtures/claude/sample-export.json';
import geminiSample from '../fixtures/gemini/sample-export.json';
import chatgptSample from '../fixtures/chatgpt/minimal.json';

describe('parseConversations — registry-resolved pipeline', () => {
  it('parses and normalizes a real export end-to-end', () => {
    const result = parseConversations('deepseek', sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.sourceProvider).toBe('deepseek');
    expect(result.data[0]?.messages).toHaveLength(6);
    expect(result.data[1]?.messages).toHaveLength(2);
  });

  it('produces alternating user/assistant messages for the real export', () => {
    const result = parseConversations('deepseek', sampleReal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('surfaces a parse failure as a typed result instead of throwing', () => {
    const result = parseConversations('deepseek', { not: 'an array' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UnexpectedTypeError');
  });

  it('never throws on hostile input', () => {
    expect(() => parseConversations('deepseek', undefined)).not.toThrow();
    expect(() => parseConversations('deepseek', [null])).not.toThrow();
  });

  it('imports an export carrying attachments and tool activity, not just text', () => {
    // The path a real import actually takes. This whole file used to fail with
    // MissingFieldError because `content` was required on every fragment type.
    const detection = detectProvider(sampleRich);
    expect(detection).toEqual({ ok: true, data: 'deepseek' });
    if (!detection.ok) return;

    const result = parseConversations(detection.data, sampleRich);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]?.messages).toHaveLength(12);
    // All three payload categories survive the round trip.
    expect(new Set(result.data[0]?.messages.map((message) => message.kind))).toEqual(
      new Set(['text', 'attachment', 'tool_activity']),
    );
  });

  it('parses every registered provider from its own fixture', () => {
    // One entry per registered provider; extended as new providers are added.
    const fixtures = [
      { id: 'deepseek' as const, data: sampleReal as unknown },
      { id: 'claude' as const, data: claudeSample as unknown },
      { id: 'gemini' as const, data: geminiSample as unknown },
      { id: 'chatgpt' as const, data: chatgptSample as unknown },
    ];
    expect(fixtures.length).toBe(PROVIDER_MODULES.length);

    for (const fixture of fixtures) {
      // Detection chooses the id, exactly as the worker does — no hard-coding.
      const detection = detectProvider(fixture.data);
      expect(detection).toEqual({ ok: true, data: fixture.id });
      if (!detection.ok) return;

      const result = parseConversations(detection.data, fixture.data);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.length).toBeGreaterThan(0);
      for (const conversation of result.data) {
        expect(conversation.sourceProvider).toBe(fixture.id);
        expect(typeof conversation.sourceConversationId).toBe('string');
        expect(conversation.messages.length).toBeGreaterThan(0);
      }
    }
  });

  it('exposes parse() on every registered module (single registry, one hook)', () => {
    for (const module of PROVIDER_MODULES) {
      expect(typeof module.parse).toBe('function');
    }
  });

  it.each([
    [
      'a mapping without a literal root key',
      [
        {
          id: 'c1',
          mapping: { '1': { message: { fragments: [{ type: 'REQUEST', content: 'hi' }] } } },
        },
      ],
    ],
    [
      'nodes that carry no children links at all',
      [
        {
          id: 'c1',
          mapping: {
            '1': { message: { fragments: [{ type: 'REQUEST', content: 'q' }] } },
            '2': { message: { fragments: [{ type: 'RESPONSE', content: 'a' }] } },
          },
        },
      ],
    ],
  ])('parses anything detection claims: %s (Invariant #2)', (_label, payload) => {
    // Guards the seam between the two units: a file detection accepts must never
    // then fail to parse, so `parse()` may not demand more structure than
    // `detect()` checks.
    expect(detectProvider(payload)).toEqual({ ok: true, data: 'deepseek' });

    const result = parseConversations('deepseek', payload);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]?.messages.length).toBeGreaterThan(0);
  });
});

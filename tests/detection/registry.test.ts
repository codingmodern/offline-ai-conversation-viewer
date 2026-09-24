import { describe, expect, it } from 'vitest';
import { PROVIDER_MODULES, findProviderModule } from '@/detection/registry';
import { detectProvider } from '@/detection/detectProvider';
import deepseekSample from '../fixtures/deepseek/sample-real.json';
import claudeSample from '../fixtures/claude/sample-export.json';
import geminiSample from '../fixtures/gemini/sample-export.json';
import chatgptSample from '../fixtures/chatgpt/minimal.json';

describe('provider registry', () => {
  it('exposes at least one registered provider', () => {
    expect(PROVIDER_MODULES.length).toBeGreaterThan(0);
  });

  it('gives every module the contract shape required by code-standards §4', () => {
    for (const module of PROVIDER_MODULES) {
      expect(typeof module.id).toBe('string');
      expect(typeof module.detect).toBe('function');
      // Unit 03 hangs `parse()` off the *same* entry, so no second registry exists.
      expect(typeof module.parse).toBe('function');
    }
  });

  it('keeps provider ids unique so a lookup is never ambiguous', () => {
    const ids = PROVIDER_MODULES.map((module) => module.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves each registered module by id (the lookup Unit 03 reuses)', () => {
    expect(findProviderModule('deepseek')?.id).toBe('deepseek');
    expect(findProviderModule('claude')?.id).toBe('claude');
    expect(findProviderModule('gemini')?.id).toBe('gemini');
    expect(findProviderModule('chatgpt')?.id).toBe('chatgpt');
  });

  it('detects every registered provider from its own fixture', () => {
    // One entry per registered provider; extended as new providers are added.
    const fixtures = [
      { id: 'deepseek', data: deepseekSample as unknown },
      { id: 'claude', data: claudeSample as unknown },
      { id: 'gemini', data: geminiSample as unknown },
      { id: 'chatgpt', data: chatgptSample as unknown },
    ];
    expect(fixtures.length).toBe(PROVIDER_MODULES.length);

    for (const fixture of fixtures) {
      expect(detectProvider(fixture.data)).toEqual({ ok: true, data: fixture.id });
    }
  });

  it('keeps the four signatures mutually exclusive (no ambiguous file)', () => {
    // The whole point of conjunctive signatures: each fixture matches exactly
    // one provider, so detection never needs a tiebreaker.
    expect(detectProvider(deepseekSample as unknown)).toEqual({
      ok: true,
      data: 'deepseek',
    });
    expect(detectProvider(claudeSample as unknown)).toEqual({
      ok: true,
      data: 'claude',
    });
    expect(detectProvider(geminiSample as unknown)).toEqual({
      ok: true,
      data: 'gemini',
    });
    expect(detectProvider(chatgptSample as unknown)).toEqual({
      ok: true,
      data: 'chatgpt',
    });
  });
});


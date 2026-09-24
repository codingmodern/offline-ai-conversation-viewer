import { describe, expect, it, vi } from 'vitest';
import { detectProvider } from '@/detection/detectProvider';
import { parseSuccess } from '@/types/errors';
import type { ProviderId, ProviderModule, ProviderRawData } from '@/types/providers';

/**
 * Stub modules. Detection is tested against stubs (not real providers) so the
 * 0/1/many verdicts can be exercised deterministically without depending on any
 * platform signature.
 *
 * `parse` is part of the module contract but is never called here: detection
 * resolves a provider id and nothing more, so the stub only satisfies the shape.
 */
function stubParse(): ReturnType<ProviderModule['parse']> {
  return parseSuccess<ProviderRawData>({ providerId: 'deepseek' });
}

/** Builds a stub from an explicit `detect` implementation. */
function stubWith(id: string, detect: () => boolean): ProviderModule {
  return { id: id as ProviderId, detect, parse: stubParse };
}

/** Builds a stub whose `detect` always returns `matches`. */
function stub(id: string, matches: boolean): ProviderModule {
  return stubWith(id, () => matches);
}

describe('detectProvider', () => {
  it('returns the provider id when exactly one module matches', () => {
    const modules = [stub('alpha', false), stub('beta', true), stub('gamma', false)];

    const result = detectProvider({ any: 'payload' }, modules);

    expect(result).toEqual({ ok: true, data: 'beta' });
  });

  it('fails with UnsupportedFormatError when no module matches', () => {
    const result = detectProvider([1, 2, 3], [stub('alpha', false), stub('beta', false)]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UnsupportedFormatError');
    }
  });

  it.each([
    ['an unrelated object', { totally: 'unrelated' }],
    ['an array of numbers', [1, 2, 3]],
    ['a primitive', 'just a string'],
  ])('rejects %s against the real registry', (_label, payload) => {
    const result = detectProvider(payload);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UnsupportedFormatError');
    }
  });

  it('fails with AmbiguousFormatError when several modules match (never picks the first)', () => {
    const modules = [stub('alpha', true), stub('beta', true)];

    const result = detectProvider({}, modules);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AmbiguousFormatError');
    }
  });

  it('keeps the ambiguous match list as technical detail only', () => {
    const result = detectProvider({}, [stub('alpha', true), stub('beta', true)]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Diagnostics live in `detail` (console-only), never in the mapped message.
      expect(result.error.detail).toContain('alpha');
      expect(result.error.detail).toContain('beta');
    }
  });

  it('asks every module even after a match, so ambiguity cannot be missed', () => {
    const later = vi.fn(() => false);
    const modules: ProviderModule[] = [stub('alpha', true), stubWith('later', later)];

    detectProvider({}, modules);

    expect(later).toHaveBeenCalledTimes(1);
  });

  it('treats a throwing detect() as "no match" and isolates the healthy module', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exploding = stubWith('exploding', () => {
      throw new Error('boom');
    });

    const result = detectProvider({}, [exploding, stub('healthy', true)]);

    expect(result).toEqual({ ok: true, data: 'healthy' });
  });

  it('evaluates modules in registry order', () => {
    const order: string[] = [];
    const record = (id: string): ProviderModule =>
      stubWith(id, () => {
        order.push(id);
        return false;
      });

    detectProvider({}, [record('first'), record('second'), record('third')]);

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('lets a new provider be added without altering existing verdicts (FR8)', () => {
    const existing = [stub('alpha', false), stub('beta', true)];
    const before = detectProvider({}, existing);

    // Registering an unrelated provider must not change the previous outcome.
    const after = detectProvider({}, [...existing, stub('newcomer', false)]);

    expect(after).toEqual(before);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GROUP_COLLAPSE_STORAGE_KEY,
  readCollapsedGroups,
  writeCollapsedGroups,
} from '@/features/library/groupCollapseState';

/**
 * The Sidebar's remembered open/closed state (Unit 13 FR4) against a real
 * `localStorage`, including the spec's Validation rule: a corrupt stored value
 * must degrade to the default — every group open — rather than crash.
 */

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('group collapse persistence (FR4)', () => {
  it('defaults to every group open when nothing has been stored', () => {
    expect(readCollapsedGroups()).toEqual({});
  });

  it('round-trips exactly what was written', () => {
    writeCollapsedGroups({ deepseek: true, gemini: false });

    expect(readCollapsedGroups()).toEqual({ deepseek: true, gemini: false });
  });

  it('falls back to all-open when the stored value is not JSON (spec Validation)', () => {
    window.localStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, '{not json');

    expect(readCollapsedGroups()).toEqual({});
  });

  it('falls back to all-open when the value is valid JSON but not a map', () => {
    for (const value of ['[1,2]', '"collapsed"', 'null', '3']) {
      window.localStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, value);
      expect(readCollapsedGroups()).toEqual({});
    }
  });

  it('drops unknown platforms and non-boolean values instead of trusting them', () => {
    // A partially damaged map must lose only what was damaged — not every
    // preference the user set alongside it.
    window.localStorage.setItem(
      GROUP_COLLAPSE_STORAGE_KEY,
      JSON.stringify({ deepseek: true, unregistered: true, claude: 'yes' }),
    );

    expect(readCollapsedGroups()).toEqual({ deepseek: true });
  });

  it('treats absence and an explicit false as the same: open', () => {
    writeCollapsedGroups({ claude: false });

    const collapsed = readCollapsedGroups();
    expect(collapsed.claude).toBe(false);
    // Only `true` ever collapses — the default is open for everyone else.
    expect(collapsed.gemini).toBeUndefined();
  });

  it('survives a browser that refuses to read storage (spec Validation)', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(readCollapsedGroups()).toEqual({});
  });

  it('survives a browser that refuses to write storage', () => {
    // Forgetting the choice beats a control that throws while toggling.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => writeCollapsedGroups({ deepseek: true })).not.toThrow();
  });
});

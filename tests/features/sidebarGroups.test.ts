import { describe, expect, it } from 'vitest';
import type { ProviderId } from '@/types/providers';
import { PLATFORM_GROUP_ORDER, buildPlatformGroups } from '@/features/library/sidebarGroups';
import { makeEntry } from '../fixtures/conversations';

/**
 * `buildPlatformGroups` is where Unit 13's real decisions live (FR1/FR3), so it
 * is tested as a pure function — no DOM, no storage. Everything the Sidebar does
 * with these groups is covered by `tests/components/Sidebar.test.tsx`.
 */

const T = 1_700_000_000_000;

/**
 * Compile-time exhaustiveness, made visible: `Record<ProviderId, …>` needs a key
 * for *every* member of the union, so registering a fifth provider fails this
 * file's type-check until it is also listed in `PLATFORM_GROUP_ORDER`. FR1's
 * fixed four-group list therefore cannot fall silently behind `types/providers`.
 */
const ALL_PROVIDERS: Record<ProviderId, true> = {
  chatgpt: true,
  claude: true,
  deepseek: true,
  gemini: true,
};

describe('PLATFORM_GROUP_ORDER', () => {
  it('matches the provider registry exactly, in FR1 order', () => {
    expect([...PLATFORM_GROUP_ORDER]).toEqual(['chatgpt', 'claude', 'deepseek', 'gemini']);
    expect([...PLATFORM_GROUP_ORDER].sort()).toEqual(Object.keys(ALL_PROVIDERS).sort());
  });
});

describe('buildPlatformGroups', () => {
  it('returns all four platforms for an empty library, in the fixed order (FR1)', () => {
    const groups = buildPlatformGroups([]);

    expect(groups.map((group) => group.platform)).toEqual([
      'chatgpt',
      'claude',
      'deepseek',
      'gemini',
    ]);
    // An empty group is a group with a zero count, never a missing one — that is
    // what makes FR6's import entry reachable before anything has been imported.
    expect(groups.every((group) => group.count === 0)).toBe(true);
  });

  it('orders non-empty groups by newest import, then appends empties in fixed order (FR3)', () => {
    const groups = buildPlatformGroups([
      makeEntry({ id: 1, platform: 'gemini', importedAt: T + 100 }),
      makeEntry({ id: 2, platform: 'chatgpt', importedAt: T + 500 }),
      makeEntry({ id: 3, platform: 'chatgpt', importedAt: T }),
    ]);

    expect(groups.map((group) => group.platform)).toEqual([
      'chatgpt', // newest import in the bucket: T + 500
      'gemini', // T + 100
      'claude', // empty groups, fixed order
      'deepseek',
    ]);
  });

  it('breaks an import-time tie with the fixed order, not with input order (Edge Cases)', () => {
    // Two platforms whose newest imports share a millisecond: sort stability or
    // object-key order would make the sidebar reshuffle between renders, so the
    // documented order is the tie-break.
    const groups = buildPlatformGroups([
      makeEntry({ id: 1, platform: 'gemini', importedAt: T }),
      makeEntry({ id: 2, platform: 'claude', importedAt: T }),
    ]);

    expect(groups.map((group) => group.platform)).toEqual([
      'claude',
      'gemini',
      'chatgpt',
      'deepseek',
    ]);
  });

  it('counts only that platform and reports its newest import', () => {
    const groups = buildPlatformGroups([
      makeEntry({ id: 1, platform: 'deepseek', importedAt: T }),
      makeEntry({ id: 2, platform: 'deepseek', importedAt: T + 10 }),
      makeEntry({ id: 3, platform: 'chatgpt', importedAt: T + 900 }),
    ]);

    const deepseek = groups.find((group) => group.platform === 'deepseek');
    expect(deepseek?.count).toBe(2);
    expect(deepseek?.latestImportedAt).toBe(T + 10);
    expect(groups.find((group) => group.platform === 'claude')?.count).toBe(0);
    expect(groups.find((group) => group.platform === 'claude')?.latestImportedAt).toBe(0);
  });

  it('keeps the library emission order inside a bucket (rows need no second sort)', () => {
    const groups = buildPlatformGroups([
      makeEntry({ id: 7, platform: 'deepseek', importedAt: T + 5 }),
      makeEntry({ id: 3, platform: 'deepseek', importedAt: T + 9 }),
      makeEntry({ id: 5, platform: 'deepseek', importedAt: T + 1 }),
    ]);

    const deepseek = groups.find((group) => group.platform === 'deepseek');
    expect(deepseek?.entries.map((entry) => entry.id)).toEqual([7, 3, 5]);
  });

  it('never mutates the library emission it was handed', () => {
    const entries = [
      makeEntry({ id: 1, platform: 'gemini', importedAt: T }),
      makeEntry({ id: 2, platform: 'chatgpt', importedAt: T + 1 }),
      makeEntry({ id: 3, platform: 'deepseek', importedAt: T + 2 }),
    ];
    const snapshot = [...entries];

    buildPlatformGroups(entries);

    expect(entries).toEqual(snapshot);
  });
});

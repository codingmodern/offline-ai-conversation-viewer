import type { ProviderId } from '@/types/providers';
import { PLATFORM_GROUP_ORDER } from './sidebarGroups';

/**
 * Persisted open/closed state of the Sidebar's platform groups (Unit 13, FR4).
 *
 * Why `localStorage` and not `storage/`: this is a UI preference about
 * presentation, not library data. `storage/` is the sole owner of IndexedDB and
 * of `UnifiedConversation` (NFR1), and a collapse flag belongs to neither; the
 * language choice (`i18n/index.ts`) already sets the precedent for a preference
 * kept beside the UI that reads it.
 *
 * One key holding one JSON map, rather than one key per platform, means the
 * whole state is validated in a single pass: a corrupt value can only ever
 * degrade to all-groups-open, never to a half-read mixture (spec Validation).
 */
export const GROUP_COLLAPSE_STORAGE_KEY = 'app-library-group-collapse';

/** Only platforms explicitly stored as collapsed are `true`; everything else is open. */
export type CollapsedGroups = Readonly<Partial<Record<ProviderId, boolean>>>;

function isKnownPlatform(value: string): value is ProviderId {
  return PLATFORM_GROUP_ORDER.some((platform) => platform === value);
}

/**
 * Reads the stored collapse map, returning an empty map (= every group open) for
 * **any** value that is not a usable map.
 *
 * Both the storage access and the parse are guarded: `localStorage` can throw
 * outright (private mode, storage disabled) and a hand-edited or truncated value
 * makes `JSON.parse` throw. Neither may reach the user as a crash — the spec
 * Validation rule is that a corrupt stored value degrades to the default, which
 * is all-groups-open. Unknown keys and non-boolean values are dropped rather
 * than trusted, so a partially damaged map loses only what was damaged.
 */
export function readCollapsedGroups(): CollapsedGroups {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY);
  } catch {
    return {};
  }

  if (raw === null) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  // null, arrays and primitives are valid JSON but not a collapse map.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const collapsed: Partial<Record<ProviderId, boolean>> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (isKnownPlatform(key) && typeof value === 'boolean') {
      collapsed[key] = value;
    }
  }
  return collapsed;
}

/**
 * Persists the collapse map. A failed write is swallowed on purpose: a browser
 * that refuses storage must still let the group be toggled for this session —
 * forgetting the choice is strictly better than a control that throws.
 */
export function writeCollapsedGroups(collapsed: CollapsedGroups): void {
  try {
    window.localStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // Intentionally swallowed — see the doc comment above.
  }
}
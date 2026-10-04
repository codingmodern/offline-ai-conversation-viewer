import { useCallback, useEffect, useState } from 'react';
import type { ProviderId } from '@/types/providers';
import { readCollapsedGroups, writeCollapsedGroups } from './groupCollapseState';
import type { CollapsedGroups } from './groupCollapseState';

/**
 * The Sidebar's group open/closed state, remembered between visits (Unit 13, FR4).
 *
 * Absence is meaningful: a platform with no stored value renders open, which is
 * why `isCollapsed` asks for `=== true` rather than for truthiness of the map.
 * A first-ever visitor therefore gets four expanded groups — and so does a
 * visitor whose stored value turned out to be corrupt (FR4 + spec Validation).
 */
export interface UseGroupCollapseResult {
  readonly isCollapsed: (platform: ProviderId) => boolean;
  readonly toggleGroup: (platform: ProviderId) => void;
}

export function useGroupCollapse(): UseGroupCollapseResult {
  // Lazy initializer: the storage read happens once per mount, not once per render.
  const [collapsed, setCollapsed] = useState<CollapsedGroups>(readCollapsedGroups);

  useEffect(() => {
    // Writing here rather than inside the updater keeps the state update pure; it
    // also normalises a corrupt stored value on first mount, at no extra cost.
    writeCollapsedGroups(collapsed);
  }, [collapsed]);

  const isCollapsed = useCallback(
    (platform: ProviderId): boolean => collapsed[platform] === true,
    [collapsed],
  );

  const toggleGroup = useCallback((platform: ProviderId): void => {
    setCollapsed((previous) => ({ ...previous, [platform]: previous[platform] !== true }));
  }, []);

  return { isCollapsed, toggleGroup };
}
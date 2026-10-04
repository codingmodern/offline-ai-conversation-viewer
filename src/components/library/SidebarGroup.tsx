import { useId } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformIcon } from '@/components/import/PlatformIcons';
import { ConversationListItem } from '@/components/library/ConversationListItem';
import { PLATFORM_LABEL } from '@/components/library/platformLabels';
import type { PlatformGroup } from '@/features/library/sidebarGroups';
import styles from './SidebarGroup.module.css';

interface SidebarGroupProps {
  readonly group: PlatformGroup;
  readonly activeId: number | undefined;
  /** Ignored by an empty group: it has no body, so it has no collapsed state. */
  readonly isCollapsed: boolean;
  readonly onToggle: () => void;
  readonly onSelect: (id: number) => void;
  readonly onRequestDelete: (id: number) => void;
  /** Empty group only: its header *is* the import entry point (FR6). */
  readonly onImportClick: () => void;
}

/**
 * One platform section of the Sidebar (Unit 13).
 *
 * The two shapes are deliberately different, because the spec gives them
 * different jobs:
 *
 *   - A group with conversations is an accordion. Its header toggles, carries a
 *     chevron, and its body lists that platform rows — the FR4 behaviour, with
 *     the open/closed choice remembered per platform.
 *   - An empty group has nothing to expand, so FR4 toggle does not apply to it
 *     at all. Instead the whole header is the FR6 import entry point: clicking it
 *     opens the import flow with this platform already chosen, which is what turns
 *     this platform is empty into the action that fills it. That is why no chevron
 *     and no second button appear here — an accordion affordance would promise a
 *     body that does not exist, and the header already *is* the action.
 *
 * Both shapes show the same three things in the same place — the platform mark,
 * its display name and its conversation count — so an empty group reads as the
 * same kind of object as a full one (FR2, spec UI Behavior).
 *
 * The mark itself is aria-hidden (drawn by `PlatformIcon`), so it changes what a
 * header *looks* like without entering its accessible name.
 */
export function SidebarGroup({
  group,
  activeId,
  isCollapsed,
  onToggle,
  onSelect,
  onRequestDelete,
  onImportClick,
}: SidebarGroupProps): JSX.Element {
  const { t } = useTranslation();
  const bodyId = useId();
  const platformLabel = PLATFORM_LABEL[group.platform];

  if (group.count === 0) {
    return (
      <section className={styles.group} aria-label={platformLabel}>
        <button
          type="button"
          className={`${styles.header} ${styles.emptyHeader}`}
          aria-label={t('sidebar.importFrom', { platform: platformLabel })}
          onClick={onImportClick}
        >
          <PlatformIcon id={group.platform} size={16} />
          <span className={styles.name}>{platformLabel}</span>
          <span className={styles.count}>{group.count}</span>
        </button>
        <p className={styles.emptyMessage}>
          {t('sidebar.groupEmpty', { platform: platformLabel })}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.group} aria-label={platformLabel}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={!isCollapsed}
        aria-controls={bodyId}
        data-collapsed={isCollapsed}
        onClick={onToggle}
      >
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
        <PlatformIcon id={group.platform} size={16} />
        <span className={styles.name}>{platformLabel}</span>
        <span className={styles.count}>{group.count}</span>
      </button>
      {/* `hidden` rather than conditionally rendering: the rows stay out of the
          accessibility tree and out of the tab order while the group is closed,
          and the UA display: none restarts the expand animation on reopening. */}
      <div id={bodyId} className={styles.body} hidden={isCollapsed}>
        <ul className={styles.list}>
          {group.entries.map((entry) => (
            <ConversationListItem
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeId}
              onSelect={onSelect}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
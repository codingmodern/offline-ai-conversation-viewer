import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryEntry } from '@/types/storage';
import { activeDateLocale } from '@/i18n';
import { PLATFORM_LABEL } from './platformLabels';
import styles from './ConversationListItem.module.css';

interface ConversationListItemProps {
  readonly entry: LibraryEntry;
  readonly isActive: boolean;
  readonly onSelect: (id: number) => void;
  readonly onRequestDelete: (id: number) => void;
}

/**
 * Formats the import date for display.
 *
 * Uses the **active UI locale** (Unit 12): Persian shows the Jalali calendar with
 * Persian digits, English shows Gregorian — the same split `ui-context.md` §2
 * describes for the shell, now applied per chosen language instead of being
 * hardcoded. Date + time, because several conversations are often imported on the
 * same day, which would otherwise make the ordering look arbitrary.
 */
function formatImportedAt(importedAt: number): string {
  return new Intl.DateTimeFormat(activeDateLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(importedAt));
}

/**
 * One row in the Sidebar (FR4).
 *
 * A `<button>` inside an `<li>`, which gives keyboard operation, Enter/Space
 * activation and focus order for free — the reason no manual `tabIndex` or
 * `onKeyDown` appears here (`ui-context.md` §6).
 *
 * `aria-current="true"` marks the active row so the selection is announced, not
 * merely coloured. The delete control is a sibling button rather than nested
 * inside the row button, because nested interactive elements are invalid HTML and
 * unreachable by keyboard.
 */
export function ConversationListItem({
  entry,
  isActive,
  onSelect,
  onRequestDelete,
}: ConversationListItemProps): JSX.Element {
  const { t } = useTranslation();
  const label = entry.title ?? t('library.untitled');

  return (
    <li className={styles.item} data-active={isActive}>
      <button
        type="button"
        className={styles.select}
        aria-current={isActive ? 'true' : undefined}
        onClick={() => {
          onSelect(entry.id);
        }}
      >
        <span className={styles.title}>{label}</span>
        <span className={styles.meta}>
          <span className={styles.platform}>{PLATFORM_LABEL[entry.platform]}</span>
          <span aria-hidden="true">·</span>
          <span>{t('library.messageCount', { count: entry.messageCount })}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(entry.importedAt).toISOString()}>
            {formatImportedAt(entry.importedAt)}
          </time>
        </span>
      </button>
      <button
        type="button"
        className={styles.delete}
        // Names the target, so a screen-reader user hears which row this deletes
        // instead of a row of identical "delete" buttons.
        aria-label={t('library.deleteRowLabel', { label })}
        onClick={() => {
          // Only *requests* the delete; the dialog decides (FR6/FR7).
          onRequestDelete(entry.id);
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </li>
  );
}

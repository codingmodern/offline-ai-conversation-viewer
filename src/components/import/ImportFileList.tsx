import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportItem } from '@/features/import/useImport';
import { translateMessage } from '@/i18n/messages';
import { formatFileSize } from '@/features/import/fileTypeGuard';
import styles from './ImportFileList.module.css';

interface ImportFileListProps {
  readonly items: readonly ImportItem[];
}

/**
 * Translation keys for the three generic verdicts; keys rather than copy so the
 * list follows the chosen language (Unit 12).
 */
const STATUS_KEYS = {
  validating: 'import.statusValidating',
  success: 'import.statusSuccess',
  error: 'import.statusError',
} as const;

/**
 * Per-file progress and results (`01-import-validation.md` FR7/FR8).
 *
 * Each row keeps its own state so a failing file never removes a successful one
 * from view. The list is a live region so screen readers hear each verdict.
 *
 * Verdicts are translated **at render time**: an error row can stay visible while
 * the user switches languages, and only then does translating keep the row from
 * being the one component still speaking the old language (spec AC4).
 */
export function ImportFileList({ items }: ImportFileListProps): JSX.Element | null {
  const { t } = useTranslation();

  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={styles.list} aria-live="polite" aria-label={t('import.fileListLabel')}>
      {items.map((item) => (
        <li key={item.id} className={styles.item} data-status={item.status}>
          <span className={styles.name}>{item.fileName}</span>
          <span className={styles.size}>{formatFileSize(item.size)}</span>
          <span className={`${styles.status} ${styles[item.status]}`}>
            {/* On failure the error's own message replaces the generic label. */}
            {item.status === 'error' && item.message !== undefined
              ? translateMessage(t, item.message)
              : t(STATUS_KEYS[item.status])}
          </span>
        </li>
      ))}
    </ul>
  );
}

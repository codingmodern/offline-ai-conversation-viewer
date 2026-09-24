import type { JSX } from 'react';
import type { ImportItem } from '@/features/import/useImport';
import { formatFileSize } from '@/features/import/fileTypeGuard';
import styles from './ImportFileList.module.css';

interface ImportFileListProps {
  readonly items: readonly ImportItem[];
}

const STATUS_LABEL = {
  validating: 'در حال بررسی…',
  success: 'معتبر',
  error: 'ناموفق',
} as const;

/**
 * Per-file progress and results (`01-import-validation.md` FR7/FR8).
 *
 * Each row keeps its own state so a failing file never removes a successful one
 * from view. The list is a live region so screen readers hear each verdict.
 */
export function ImportFileList({ items }: ImportFileListProps): JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={styles.list} aria-live="polite" aria-label="وضعیت فایل‌های وارد شده">
      {items.map((item) => (
        <li key={item.id} className={styles.item} data-status={item.status}>
          <span className={styles.name}>{item.fileName}</span>
          <span className={styles.size}>{formatFileSize(item.size)}</span>
          <span className={`${styles.status} ${styles[item.status]}`}>
            {/* On failure the already-translated message replaces the generic label. */}
            {item.status === 'error' ? item.message : STATUS_LABEL[item.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

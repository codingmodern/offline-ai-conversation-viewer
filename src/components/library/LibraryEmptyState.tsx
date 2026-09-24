import type { JSX } from 'react';
import styles from './LibraryEmptyState.module.css';

interface LibraryEmptyStateProps {
  /** Opens the import screen. Wired to the Sidebar's add action. */
  readonly onImportClick: () => void;
}

/**
 * Empty State for a library with no conversations (`ui-context.md` §3, §4).
 *
 * Follows the project's empty-state rule: explain *why* the space is empty and
 * offer the one action that fills it, rather than showing a bare "no data" label.
 * It doubles as the post-delete destination when the last conversation is removed
 * (ADR #10).
 */
export function LibraryEmptyState({ onImportClick }: LibraryEmptyStateProps): JSX.Element {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>هنوز گفتگویی ذخیره نشده است</h2>
      <p className={styles.text}>
        فایل خروجی گفتگوهای خود را وارد کنید تا در همین مرورگر ذخیره شوند و هر بار بدون نیاز به
        اینترنت در دسترس باشند.
      </p>
      <button type="button" className={styles.action} onClick={onImportClick}>
        وارد کردن فایل گفتگو
      </button>
    </div>
  );
}

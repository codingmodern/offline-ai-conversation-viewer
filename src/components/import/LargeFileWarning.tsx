import type { JSX } from 'react';
import type { PendingLargeFile } from '@/features/import/useImport';
import { formatFileSize } from '@/features/import/fileTypeGuard';
import styles from './LargeFileWarning.module.css';

interface LargeFileWarningProps {
  readonly pendingFiles: readonly PendingLargeFile[];
  readonly onConfirm: (id: string) => void;
  readonly onCancel: (id: string) => void;
}

/**
 * Warns before parsing a file larger than 50MB (`01-import-validation.md` FR9).
 *
 * It warns rather than blocks: a big export is still a legitimate export, so the
 * user decides. Rendered as an inline banner (not a modal) so several oversized
 * files in one drop can each be answered independently.
 */
export function LargeFileWarning({
  pendingFiles,
  onConfirm,
  onCancel,
}: LargeFileWarningProps): JSX.Element | null {
  if (pendingFiles.length === 0) {
    return null;
  }

  return (
    <>
      {pendingFiles.map((pending) => (
        <div
          key={pending.id}
          className={styles.banner}
          role="alertdialog"
          aria-labelledby={`${pending.id}-text`}
        >
          <p className={styles.text} id={`${pending.id}-text`}>
            حجم فایل <span className={styles.name}>{pending.file.name}</span> برابر{' '}
            {formatFileSize(pending.file.size)} است و پردازش آن ممکن است طول بکشد. ادامه می‌دهید؟
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                onConfirm(pending.id);
              }}
            >
              ادامه
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                onCancel(pending.id);
              }}
            >
              انصراف
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

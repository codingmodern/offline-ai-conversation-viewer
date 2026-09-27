import type { JSX } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
 *
 * Unit 12: the sentence is a `Trans`, not a plain `t`, because the filename keeps
 * its own element (and styling) **inside** the sentence. Both languages then own
 * the whole word order — the filename can move without the copy having to be
 * split into fragments that could never be translated separately.
 */
export function LargeFileWarning({
  pendingFiles,
  onConfirm,
  onCancel,
}: LargeFileWarningProps): JSX.Element | null {
  const { t } = useTranslation();

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
            <Trans
              i18nKey="import.largeFileWarning"
              values={{
                name: pending.file.name,
                size: formatFileSize(pending.file.size),
              }}
              components={{ file: <span className={styles.name} /> }}
            />
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                onConfirm(pending.id);
              }}
            >
              {t('import.continue')}
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                onCancel(pending.id);
              }}
            >
              {t('import.cancel')}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

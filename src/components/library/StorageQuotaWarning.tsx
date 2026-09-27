import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './StorageQuotaWarning.module.css';

interface StorageQuotaWarningProps {
  /** True only when an estimate exists *and* usage is ≥90% (Decision 3). */
  readonly isNearLimit: boolean;
}

/**
 * Warns before the browser's storage actually runs out (Decision 3 / ADR #11).
 *
 * Advisory, not blocking: the estimate is approximate, so importing stays allowed
 * and a genuine overflow is still handled as a typed `StorageQuotaError` with the
 * library left intact (FR2).
 *
 * `role="status"` rather than `role="alert"`: nothing has failed yet, so this
 * should be announced politely without interrupting the user's current task.
 */
export function StorageQuotaWarning({ isNearLimit }: StorageQuotaWarningProps): JSX.Element | null {
  const { t } = useTranslation();

  if (!isNearLimit) {
    return null;
  }

  return (
    <p className={styles.warning} role="status">
      {t('library.quotaWarning')}
    </p>
  );
}

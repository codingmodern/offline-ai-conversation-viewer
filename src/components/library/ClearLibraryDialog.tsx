import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface ClearLibraryDialogProps {
  /** `false` renders nothing — the bulk delete is never in progress by default. */
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Bulk-clear confirmation — exactly ONE dialog for the whole library (ADR #14).
 *
 * Copy-only wrapper around `ConfirmDialog`, the same shape as the
 * single-conversation delete prompt: focus lands on the cancel option, Escape
 * cancels, and no path exists that empties the library without this prompt being
 * read and the destructive option chosen explicitly. The copy states plainly that
 * the action cannot be undone — there is no backend and no trash to recover from.
 *
 * Unit 12: all four strings are translated here rather than passed in by the
 * shell, so the dialog is the single owner of its own copy in every language.
 */
export function ClearLibraryDialog({
  isPending,
  onConfirm,
  onCancel,
}: ClearLibraryDialogProps): JSX.Element | null {
  const { t } = useTranslation();

  if (!isPending) {
    return null;
  }

  return (
    <ConfirmDialog
      title={t('dialogs.clearAllTitle')}
      description={t('dialogs.clearAllDescription')}
      confirmLabel={t('dialogs.clearAllConfirm')}
      cancelLabel={t('dialogs.cancel')}
      isDestructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

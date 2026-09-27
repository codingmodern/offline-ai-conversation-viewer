import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingDelete } from '@/features/library/useLibrary';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface DeleteConversationDialogProps {
  /** `undefined` renders nothing — deletion is never in progress by default. */
  readonly pendingDelete: PendingDelete | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Delete confirmation (FR6/FR7).
 *
 * Copy-only wrapper around `ConfirmDialog`: it holds no logic, so there is no
 * path — no keyboard shortcut, no timeout, no double-click — that could delete a
 * conversation without the user reading this prompt and choosing the destructive
 * option. The dialog names the conversation so the user can see *which* record is
 * at stake, and states plainly that the action cannot be undone, since there is no
 * backend and no trash to recover from.
 *
 * Unit 12: both the title and the question are translated here; the conversation
 * label travels as an interpolation parameter, never as concatenated sentences —
 * Persian and English order the clause differently, so only the whole sentence can
 * be translated correctly.
 */
export function DeleteConversationDialog({
  pendingDelete,
  onConfirm,
  onCancel,
}: DeleteConversationDialogProps): JSX.Element | null {
  const { t } = useTranslation();

  if (pendingDelete === undefined) {
    return null;
  }

  const label = pendingDelete.title ?? t('library.untitled');

  return (
    <ConfirmDialog
      title={t('dialogs.deleteTitle')}
      description={t('dialogs.deleteDescription', { label })}
      confirmLabel={t('dialogs.deleteConfirm')}
      cancelLabel={t('dialogs.cancel')}
      isDestructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

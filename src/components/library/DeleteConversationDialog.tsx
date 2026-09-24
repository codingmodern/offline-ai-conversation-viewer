import type { JSX } from 'react';
import type { PendingDelete } from '@/features/library/useLibrary';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface DeleteConversationDialogProps {
  /** `undefined` renders nothing — deletion is never in progress by default. */
  readonly pendingDelete: PendingDelete | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Fallback label for an export that carried no title (`ui-context.md` §4). */
const UNTITLED_LABEL = 'گفتگوی بی‌عنوان';

/**
 * Delete confirmation (FR6/FR7).
 *
 * Copy-only wrapper around `ConfirmDialog`: it holds no logic, so there is no
 * path — no keyboard shortcut, no timeout, no double-click — that could delete a
 * conversation without the user reading this prompt and choosing the destructive
 * option. The dialog names the conversation so the user can see *which* record is
 * at stake, and states plainly that the action cannot be undone, since there is no
 * backend and no trash to recover from.
 */
export function DeleteConversationDialog({
  pendingDelete,
  onConfirm,
  onCancel,
}: DeleteConversationDialogProps): JSX.Element | null {
  if (pendingDelete === undefined) {
    return null;
  }

  const label = pendingDelete.title ?? UNTITLED_LABEL;

  return (
    <ConfirmDialog
      title="حذف گفتگو"
      description={`«${label}» برای همیشه از کتابخانه‌ی این مرورگر حذف می‌شود و بازگرداندن آن ممکن نیست. فایل اصلی روی دستگاه شما تغییری نمی‌کند.`}
      confirmLabel="حذف گفتگو"
      cancelLabel="انصراف"
      isDestructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

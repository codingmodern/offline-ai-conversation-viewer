import type { JSX } from 'react';
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
 * single-conversation delete prompt: focus lands on «انصراف», Escape cancels, and
 * no path exists that empties the library without this prompt being read and the
 * destructive option chosen explicitly. The copy states plainly that the action
 * cannot be undone — there is no backend and no trash to recover from.
 */
export function ClearLibraryDialog({
  isPending,
  onConfirm,
  onCancel,
}: ClearLibraryDialogProps): JSX.Element | null {
  if (!isPending) {
    return null;
  }

  return (
    <ConfirmDialog
      title="حذف همه‌ی گفتگوها"
      description="همه‌ی گفتگوها برای همیشه از کتابخانه‌ی این مرورگر حذف می‌شوند. این عمل قابل بازگشت نیست؛ فایل‌های اصلی روی دستگاه شما تغییری نمی‌کنند."
      confirmLabel="همه را حذف کن"
      cancelLabel="انصراف"
      isDestructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

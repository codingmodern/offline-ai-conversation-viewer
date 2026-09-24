import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

/**
 * The shared confirmation modal (FR6/FR7, ADR #14).
 *
 * Focus is on the safety properties, since both destructive flows — deleting one
 * conversation and emptying the whole library — route through this one component:
 * nothing may be confirmed implicitly, and the safe choice must be the default.
 */

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}): {
  readonly onConfirm: ReturnType<typeof vi.fn>;
  readonly onCancel: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  render(
    <ConfirmDialog
      title="عنوان"
      description="توضیح"
      confirmLabel="تأیید"
      cancelLabel="انصراف"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('announces itself as a modal alert dialog', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Labelled and described, so its purpose is announced rather than just visible.
    expect(dialog).toHaveAccessibleName('عنوان');
    expect(dialog).toHaveAccessibleDescription('توضیح');
  });

  it('focuses cancel on mount so Enter cannot confirm by accident', async () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByRole('button', { name: 'انصراف' })).toHaveFocus();

    // Pressing Enter immediately triggers the *safe* action, never the confirm.
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms only on an explicit click of the confirm button', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'تأیید' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on the cancel button', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'انصراف' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('treats Escape as cancel', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders the caller-provided copy verbatim', () => {
    renderDialog({ confirmLabel: 'در هر صورت اضافه کن' });

    // No generic "OK": the button states the action, per `ui-context.md` §4.
    expect(screen.getByRole('button', { name: 'در هر صورت اضافه کن' })).toBeInTheDocument();
  });

  it('keeps both choices reachable by keyboard', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    // Cancel holds focus, so one Tab must reach confirm.
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

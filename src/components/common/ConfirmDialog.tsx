import { useEffect, useRef, type JSX } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Marks the confirm action as destructive so it is styled as a warning. */
  readonly isDestructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Reusable confirmation modal (`ui-context.md` §4 → Confirm Dialog).
 *
 * Logic-free on purpose: it decides *nothing* about what is being confirmed, so
 * the single-conversation delete (FR6/FR7) and the bulk clear-all (ADR #14) share
 * exactly one accessible implementation. All copy arrives as props.
 *
 * Accessibility (`ui-context.md` §6):
 *   - `role="alertdialog"` with `aria-modal`, labelled by its title and described
 *     by its body, matching the pattern `LargeFileWarning` established in Unit 01.
 *   - Focus moves to the cancel button on mount, so the safe choice is the default
 *     and Enter can never destroy data by accident.
 *   - Escape cancels; the backdrop is inert, because a stray click outside a
 *     destructive prompt should not dismiss it silently.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Keyboard users land on the non-destructive option.
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        // Escape is a cancel, never a confirm — no data is touched.
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <h2 className={styles.title} id="confirm-dialog-title">
          {title}
        </h2>
        <p className={styles.description} id="confirm-dialog-description">
          {description}
        </p>
        <div className={styles.actions}>
          {/* Cancel first in DOM order: in an RTL layout it reads as the leading,
              lower-risk choice and receives focus without a tabindex hack. */}
          <button type="button" className={styles.cancel} ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={isDestructive ? styles.destructive : styles.confirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

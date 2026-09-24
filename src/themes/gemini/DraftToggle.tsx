import type { JSX } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './DraftToggle.module.css';

interface DraftToggleProps {
  /** How many drafts the turn has (never 1 — the caller hides the control). */
  readonly count: number;
  /** Which draft is on screen, 0-based. */
  readonly activeIndex: number;
  /** Selects another draft; the parent owns the state (FR11). */
  readonly onSelect: (index: number) => void;
}

/**
 * The «پیش‌نویس 1/2» control for a turn Gemini answered more than once (FR11,
 * spec EC2/AC3, ADR #25).
 *
 * Gemini recorded several drafts of *one* answer, so the theme keeps one
 * assistant message and lets the user step between its alternatives — this
 * control is the only UI that reaches `alternatives`. It renders only when
 * more than one draft exists (the caller's job), and it never invents a draft
 * count: both the total and the position come from the message's own array.
 *
 * Direction: this app is RTL-locked, so the button on the **right** is
 * previous (`ChevronRight` points backwards in RTL) — the same reading order
 * the app's own Back buttons use. Digits stay ASCII because they are data
 * (which draft, of how many), not formatted dates.
 *
 * Why it disables at the ends instead of wrapping: the control reports a
 * position in a list, and a wrap would let a click land on the same draft with
 * no visible change. Two clamped buttons are predictable without inventing any
 * extra state.
 */
export function DraftToggle({ count, activeIndex, onSelect }: DraftToggleProps): JSX.Element {
  const isFirst = activeIndex <= 0;
  const isLast = activeIndex >= count - 1;

  return (
    <div
      className={styles.toggle}
      role="group"
      aria-label="انتخاب پیش‌نویس پاسخ"
      data-draft-toggle="true"
    >
      <button
        type="button"
        className={styles.button}
        aria-label="پیش‌نویس قبلی"
        disabled={isFirst}
        onClick={(): void => {
          onSelect(activeIndex - 1);
        }}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <span
        className={styles.label}
        aria-live="polite"
        data-draft-index={activeIndex}
        data-draft-count={count}
      >
        پیش‌نویس {activeIndex + 1}/{count}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label="پیش‌نویس بعدی"
        disabled={isLast}
        onClick={(): void => {
          onSelect(activeIndex + 1);
        }}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
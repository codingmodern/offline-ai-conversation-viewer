import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DraftToggle } from '@/themes/gemini/DraftToggle';

/**
 * The «پیش‌نویس 1/2» control of the Gemini theme (FR11, spec EC2/AC3, ADR #25).
 *
 * The control is the only UI that reaches `UnifiedMessage.alternatives`, and it
 * must behave like a position indicator, not a pager that invents state: the
 * count and position come from the caller (the message's own drafts), the ends
 * disable instead of wrapping, and every button has a Persian accessible name
 * (`ui-context.md` §13 — icon-only controls need labels).
 */

describe('DraftToggle', () => {
  it('reports the position out of the draft count the export carries', () => {
    render(<DraftToggle count={2} activeIndex={0} onSelect={vi.fn()} />);

    const label = screen.getByText('پیش‌نویس 1/2');
    expect(label).toHaveAttribute('data-draft-index', '0');
    expect(label).toHaveAttribute('data-draft-count', '2');
    expect(label).toHaveAttribute('aria-live', 'polite');
    expect(label.closest('[data-draft-toggle]')).toHaveAttribute(
      'aria-label',
      'انتخاب پیش‌نویس پاسخ',
    );
  });

  it('steps forward and backward through the drafts', () => {
    const onSelect = vi.fn();
    render(<DraftToggle count={3} activeIndex={1} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس بعدی' }));
    expect(onSelect).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس قبلی' }));
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it('disables at the ends instead of wrapping around', () => {
    const { rerender } = render(<DraftToggle count={2} activeIndex={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'پیش‌نویس قبلی' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'پیش‌نویس بعدی' })).toBeEnabled();

    rerender(<DraftToggle count={2} activeIndex={1} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'پیش‌نویس قبلی' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'پیش‌نویس بعدی' })).toBeDisabled();
  });

  it('keeps the previous button on the right, the way this RTL app reads', () => {
    // Direction is a layout fact the component cannot assert in jsdom, but the
    // icon choice is code: right-pointing chevron = previous in RTL. The CSS
    // module's row is a plain flex (no row-reverse), so DOM order is visual
    // order for the RTL-locked app.
    const { container } = render(<DraftToggle count={2} activeIndex={0} onSelect={vi.fn()} />);

    const buttons = container.querySelectorAll('button');
    expect(buttons[0]).toHaveAttribute('aria-label', 'پیش‌نویس قبلی');
    expect(buttons[0]?.querySelector('svg')).toBeInTheDocument();
    expect(buttons[1]).toHaveAttribute('aria-label', 'پیش‌نویس بعدی');
  });
});
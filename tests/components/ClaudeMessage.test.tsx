import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClaudeMessage } from '@/themes/claude/ClaudeMessage';
import styles from '@/themes/claude/ClaudeMessage.module.css';
import { makeMessage } from '../fixtures/conversations';

/**
 * Action-row behaviour of the Claude message renderer, pinned against
 * `09b-claude-theme-visual-fix.md` and the ADRs it interacts with:
 *
 * - the date renders ONLY from the export's own parseable timestamp
 *   (09b row 4 + FR6 — absent/unparseable means absent, never derived);
 * - Copy stays on the user bubble (ADR #21 — the documented deviation from
 *   09b FR5's assistant-only rule);
 * - the assistant row carries no decorative icons (ADR #18 — Copy + optional
 *   date only).
 */

/** jest-dom's toHaveClass needs a string; a missing module key must fail loudly. */
function classOf(name: string | undefined): string {
  if (name === undefined) {
    throw new Error('CSS module did not export the expected class');
  }
  return name;
}

const assistantMessage = {
  role: 'assistant' as const,
  sourceFragmentType: 'RESPONSE',
  content: 'پاسخ مدل',
  createdAt: '2026-08-30T00:21:00.000000Z',
};

describe('ClaudeMessage action row (09b-claude-theme-visual-fix.md)', () => {
  it('shows the export date beside the copy button when the timestamp parses', () => {
    const { container } = render(
      <ClaudeMessage message={makeMessage(assistantMessage)} toolCards={new Map()} />,
    );

    const date = container.querySelector('[data-action-date]');
    expect(date).not.toBeNull();
    // Display-formatted (fa-IR), never the raw ISO string the export stores.
    expect(date?.textContent).not.toContain('2026');
    expect(date?.textContent).not.toContain(':');
  });

  it('omits the date entirely when the export carries none or an unparseable one', () => {
    const { container, rerender } = render(
      <ClaudeMessage
        message={makeMessage({ role: 'assistant', sourceFragmentType: 'RESPONSE', content: 'الف' })}
        toolCards={new Map()}
      />,
    );
    expect(container.querySelector('[data-action-date]')).toBeNull();

    rerender(
      <ClaudeMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: 'ب',
          createdAt: 'not-a-date',
        })}
        toolCards={new Map()}
      />,
    );
    expect(container.querySelector('[data-action-date]')).toBeNull();
  });

  it('keeps Copy on the user bubble (ADR #21 overrides 09b FR5)', () => {
    render(<ClaudeMessage message={makeMessage()} toolCards={new Map()} />);

    expect(screen.getByRole('button', { name: 'کپی پیام' })).toBeInTheDocument();
  });

  it('renders only the copy action for assistant messages — no decorative icons (ADR #18)', () => {
    const { container } = render(
      <ClaudeMessage message={makeMessage(assistantMessage)} toolCards={new Map()} />,
    );

    const assistantRow = container.querySelector('[data-role="assistant"]');
    expect(assistantRow).not.toBeNull();
    expect(assistantRow?.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'کپی پاسخ' })).toBeInTheDocument();
  });
});

describe('ClaudeMessage row class wiring (RTL mirror)', () => {
  it('wires the user bubble to the right edge and the assistant row to the plain stack', () => {
    const { container } = render(
      <>
        <ClaudeMessage message={makeMessage()} toolCards={new Map()} />
        <ClaudeMessage
          message={makeMessage({ role: 'assistant', sourceFragmentType: 'RESPONSE' })}
          toolCards={new Map()}
        />
      </>,
    );

    // Same wiring pin as the DeepSeek theme: the user row carries the
    // right-edge anchor class, the assistant row the plain full-width
    // stack class (its old flush-left anchor is gone) - never swapped,
    // never both. Rule content is pinned verbatim in
    // tests/themes/claude.alignment.test.ts.
    const userRow = container.querySelector('[data-role="user"]');
    const assistantRow = container.querySelector('[data-role="assistant"]');
    expect(userRow).not.toBeNull();
    expect(assistantRow).not.toBeNull();
    expect(userRow).toHaveClass(classOf(styles.userRow));
    expect(userRow).not.toHaveClass(classOf(styles.assistantRow));
    expect(assistantRow).toHaveClass(classOf(styles.assistantRow));
    expect(assistantRow).not.toHaveClass(classOf(styles.userRow));
  });

  it('keeps unknown-role rows on the plain block flow without the assistant row class', () => {
    const { container } = render(
      <ClaudeMessage
        message={makeMessage({ role: 'unknown', sourceFragmentType: 'SEARCHING' })}
        toolCards={new Map()}
      />,
    );

    // Unit 03's simplified edge case stays the plain full-width block.
    const unknownRow = container.querySelector('[data-role="unknown"]');
    expect(unknownRow).not.toBeNull();
    expect(unknownRow).not.toHaveClass(classOf(styles.assistantRow));
    expect(unknownRow).not.toHaveClass(classOf(styles.userRow));
  });
});

/** jsdom never lays out, so `scrollHeight`/`clientHeight` stay 0 — this mock
 * simulates a long (overflowing) bubble so the short-message default and the
 * long-message collapse path are both covered without a browser. */
function mockOverflow(overflowing: boolean): void {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflowing ? 500 : 0);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(overflowing ? 100 : 0);
}

describe('ClaudeMessage long user message collapse (09d)', () => {
  it('shows no toggle and no clamp for a short user message', () => {
    mockOverflow(false);
    const { container } = render(
      <ClaudeMessage message={makeMessage({ content: 'سلام' })} toolCards={new Map()} />,
    );

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
    // Validation: no max-height/overflow classes leak onto short content.
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).toBeNull();
  });

  it('collapses a long user message and toggles show more/less', () => {
    mockOverflow(true);
    const { container } = render(
      <ClaudeMessage
        message={makeMessage({
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
        toolCards={new Map()}
      />,
    );

    // Default: collapsed with the clamp + fade wrapper.
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).not.toBeNull();
    expect(
      container.querySelector(`.${classOf(styles.userBubbleWrapperCollapsed)}`),
    ).not.toBeNull();

    const toggle = screen.getByRole('button', { name: 'نمایش بیشتر' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'نمایش کمتر' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Expanded: clamp lifted.
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'نمایش کمتر' }));
    expect(screen.getByRole('button', { name: 'نمایش بیشتر' })).toBeInTheDocument();
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).not.toBeNull();
  });

  it('never collapses assistant messages', () => {
    mockOverflow(true);
    render(
      <ClaudeMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
        toolCards={new Map()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
  });
});

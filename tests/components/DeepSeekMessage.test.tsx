import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UnifiedMessage } from '@/types/conversation';
import { DeepSeekMessage } from '@/themes/deepseek/DeepSeekMessage';
import styles from '@/themes/deepseek/DeepSeekMessage.module.css';
import { makeMessage } from '../fixtures/conversations';

/**
 * Per-kind visual mapping (`ui-context.md` §4.6, ADR #7's `kind` discriminator):
 * user bubble on the physical right vs the full-width assistant stack,
 * THINK as the collapsible pattern,
 * attachments as metadata-only cards, tool activity as a decorative row, and
 * the unknown-role edge case rendering simplified without a crash
 * (06-multi-theme-rendering.md → Edge Cases).
 */

/** jest-dom's toHaveClass needs a string; a missing module key must fail loudly. */
function classOf(name: string | undefined): string {
  if (name === undefined) {
    throw new Error('CSS module did not export the expected class');
  }
  return name;
}

/** Installs a clipboard stub and returns the spy for call assertions. */
function stubClipboard(): { readonly writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return { writeText };
}

afterEach((): void => {
  // The stub must not leak into tests that exercise the no-clipboard path.
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe('DeepSeekMessage kind mapping', () => {
  it('renders user text as a bubble with a Copy action and verbatim content', async () => {
    const { writeText } = stubClipboard();
    render(<DeepSeekMessage message={makeMessage()} />);

    expect(screen.getByText('سلام')).toBeInTheDocument();
    // Post-Unit-06 refinement, ADR #20: the user message now has a copy
    // affordance too, identical to the assistant one (same component, same
    // label/styling/behaviour, verbatim copy of `content`).
    const copy = screen.getByRole('button', { name: 'کپی پیام' });
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledWith('سلام');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'کپی شد' })).toBeInTheDocument();
    });
  });

  it('renders assistant text full-width with Copy as the only active action', async () => {
    const { writeText } = stubClipboard();
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: 'پاسخ مدل',
        })}
      />,
    );

    expect(container.querySelector('[data-role="assistant"]')).not.toBeNull();
    expect(screen.getByText('پاسخ مدل')).toBeInTheDocument();

    // fireEvent, deliberately not userEvent: user-event installs its own
    // EventTarget clipboard stub on the document, which would shadow ours and
    // make the spy unobservable. The click itself is not what's under test.
    fireEvent.click(screen.getByRole('button', { name: 'کپی پاسخ' }));

    // Copied verbatim — never trimmed or re-formatted.
    expect(writeText).toHaveBeenCalledWith('پاسخ مدل');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'کپی شد' })).toBeInTheDocument();
    });
  });

  it('renders assistant Markdown as structured HTML, not literal ##/** text', () => {
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: '## سرفصل\nمتن **مهم**.',
        })}
      />,
    );

    const htmlRoot = container.querySelector('[data-markdown="true"]');
    expect(htmlRoot).not.toBeNull();
    expect(container.querySelector('[data-markdown="true"] h2')).not.toBeNull();
    expect(container.querySelector('[data-markdown="true"] strong')).not.toBeNull();
    // The raw markers must not survive into the rendered DOM.
    expect(screen.queryByText('## سرفصل')).toBeNull();
  });

  it('renders THINK collapsed by default and expands to a numbered list', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'THINK',
          content: 'گام اول\nگام دوم',
        })}
      />,
    );

    expect(container.querySelector('[data-fragment="THINK"]')).not.toBeNull();
    const toggle = screen.getByRole('button', { name: 'فرآیند تفکر' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed by default: no reasoning text is on screen yet.
    expect(screen.queryByText('گام اول')).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('گام اول')).toBeInTheDocument();
    expect(screen.getByText('گام دوم')).toBeInTheDocument();
    // The numbered-list structure is part of the documented pattern (ADR #17).
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('collapses THINK again on a second toggle', async () => {
    const user = userEvent.setup();
    render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'THINK',
          content: 'گام اول',
        })}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'فرآیند تفکر' });

    await user.click(toggle);
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('گام اول')).toBeNull();
  });

  it('renders attachments as name + size metadata with no interactive preview', () => {
    render(
      <DeepSeekMessage
        message={makeMessage({
          kind: 'attachment',
          sourceFragmentType: 'FILE',
          attachments: [{ fileId: 'f1', fileName: 'notes.pdf', fileSize: 1024 }],
        })}
      />,
    );

    expect(screen.getByText('notes.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    // The export carries no file bytes, so there is nothing to open: no button,
    // no link, no image.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders tool activity as a decorative row and never exposes results', () => {
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'SEARCH',
          toolActivity: { activityType: 'SEARCH', results: [{ url: 'https://example.test' }] },
        })}
      />,
    );

    expect(container.querySelector('[data-activity-type="SEARCH"]')).not.toBeNull();
    expect(screen.getByText('جستجو کرد')).toBeInTheDocument();
    // Visual only (FR6): the row must not look or behave clickable…
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    // …and the undocumented `results` payload is deliberately never rendered.
    expect(screen.queryByText(/example\.test/)).toBeNull();
  });

  it('falls back to a generic row for an unknown activity type', () => {
    render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'SOMETHING_NEW',
          toolActivity: { activityType: 'SOMETHING_NEW' },
        })}
      />,
    );

    // Preserved, not dropped (ADR #6's spirit): the row still renders.
    expect(screen.getByText('از ابزاری استفاده کرد')).toBeInTheDocument();
  });

  it('renders unknown-role text messages simplified without crashing', () => {
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'unknown',
          sourceFragmentType: 'SEARCHING',
          content: 'محتوای ناشناخته',
        })}
      />,
    );

    expect(container.querySelector('[data-role="unknown"]')).not.toBeNull();
    expect(screen.getByText('محتوای ناشناخته')).toBeInTheDocument();
    expect(screen.getByText('پیام با نقش ناشناخته')).toBeInTheDocument();
    // Simplified: no action row for a role the theme does not know.
    expect(screen.queryByRole('button', { name: 'کپی پاسخ' })).toBeNull();
  });

  it('renders a text message with no content without crashing', () => {
    const message: UnifiedMessage = {
      role: 'assistant',
      kind: 'text',
      sourceFragmentType: 'RESPONSE',
      order: 0,
    };
    const { container } = render(<DeepSeekMessage message={message} />);

    expect(container.querySelector('[data-kind="text"]')).not.toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders fenced code as a code block with its own copy action', () => {
    stubClipboard();
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: 'قبل از کد\n```python\nprint(1)\n```\nبعد از کد',
        })}
      />,
    );

    const block = container.querySelector('[data-code-block="true"]');
    expect(block).not.toBeNull();
    expect(block?.getAttribute('data-language')).toBe('python');
    expect(screen.getByText('print(1)')).toBeInTheDocument();
    expect(screen.getByText('قبل از کد')).toBeInTheDocument();
    expect(screen.getByText('بعد از کد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'کپی کد' })).toBeInTheDocument();
  });
});

describe('DeepSeekMessage row class wiring (RTL mirror)', () => {
  it('wires the user row to the right edge and the assistant row to the plain stack', () => {
    const { container } = render(
      <>
        <DeepSeekMessage message={makeMessage()} />
        <DeepSeekMessage
          message={makeMessage({
            role: 'assistant',
            sourceFragmentType: 'RESPONSE',
          })}
        />
      </>,
    );

    // The wiring behind the RTL mirror (see the module CSS note): the user
    // row carries the right-edge anchor class, the assistant row the
    // plain full-width stack class (its old flush-left anchor is gone)
    // - never swapped, never both. The CSS rules themselves are pinned
    // verbatim in tests/themes/deepseek.alignment.test.ts.
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
      <DeepSeekMessage
        message={makeMessage({
          role: 'unknown',
          sourceFragmentType: 'SEARCHING',
        })}
      />,
    );

    // Unit 03's simplified edge case stays the plain full-width block - it
    // must not inherit the assistant block's left anchoring.
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

describe('DeepSeekMessage long user message collapse (09d)', () => {
  it('shows no toggle and no clamp for a short user message', () => {
    mockOverflow(false);
    const { container } = render(<DeepSeekMessage message={makeMessage({ content: 'سلام' })} />);

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
    // Validation: no max-height/overflow classes leak onto short content.
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).toBeNull();
  });

  it('collapses a long user message and toggles show more/less', () => {
    mockOverflow(true);
    const { container } = render(
      <DeepSeekMessage
        message={makeMessage({
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
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
      <DeepSeekMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'RESPONSE',
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatGPTMessage } from '@/themes/chatgpt/ChatGPTMessage';
import styles from '@/themes/chatgpt/ChatGPTMessage.module.css';
import { makeMessage } from '../fixtures/conversations';

/**
 * Row behaviour of the ChatGPT message renderer, pinned against 11b §4.3:
 *
 * - the date renders ONLY from the export's own parseable timestamp (FR-7);
 * - Copy is the only action on both the user bubble and the assistant row
 *   (FR-8 / ADR-L — the decorative Edit/Regenerate/Like-Dislike icons are gone);
 * - the assistant row carries no model avatar (11b doc gap #4);
 * - an unsupported fragment with no body renders a self-naming placeholder,
 *   never a blank row (FR-6).
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
  sourceFragmentType: 'text',
  content: 'پاسخ مدل',
  createdAt: '2026-09-21T00:21:00.000Z',
};

describe('ChatGPTMessage action row (11b FR-7 / FR-8)', () => {
  it('shows the export date beside the copy button when the timestamp parses', () => {
    const { container } = render(<ChatGPTMessage message={makeMessage(assistantMessage)} />);

    const date = container.querySelector('[data-action-date]');
    expect(date).not.toBeNull();
    // Display-formatted (fa-IR), never the raw ISO string the export stores.
    expect(date?.textContent).not.toContain('2026-09-21');
    expect(date?.textContent).not.toContain(':');
  });

  it('omits the date entirely when the export carries none or an unparseable one', () => {
    const { container, rerender } = render(
      <ChatGPTMessage
        message={makeMessage({ role: 'assistant', sourceFragmentType: 'text', content: 'الف' })}
      />,
    );
    expect(container.querySelector('[data-action-date]')).toBeNull();

    rerender(
      <ChatGPTMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'text',
          content: 'ب',
          createdAt: 'not-a-date',
        })}
      />,
    );
    expect(container.querySelector('[data-action-date]')).toBeNull();
  });

  it('keeps Copy on the user bubble as the single action (ADR #21 + FR-8)', () => {
    render(<ChatGPTMessage message={makeMessage()} />);

    expect(screen.getByRole('button', { name: 'کپی پیام' })).toBeInTheDocument();
  });

  it('renders only the copy action for assistant messages — no decorative icons (ADR-L)', () => {
    const { container } = render(<ChatGPTMessage message={makeMessage(assistantMessage)} />);

    const assistantRow = container.querySelector('[data-role="assistant"]');
    expect(assistantRow).not.toBeNull();
    expect(assistantRow?.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'کپی پاسخ' })).toBeInTheDocument();
  });

  it('renders no model avatar on the assistant row (11b doc gap #4)', () => {
    const { container } = render(<ChatGPTMessage message={makeMessage(assistantMessage)} />);

    const assistantRow = container.querySelector('[data-role="assistant"]');
    expect(assistantRow?.querySelector('[data-model-avatar]')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('names an unsupported fragment instead of rendering a blank row (FR-6)', () => {
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          role: 'assistant',
          kind: 'text',
          content: '',
          sourceFragmentType: 'super_widget',
          order: 3,
        })}
      />,
    );

    const placeholder = container.querySelector('[data-unsupported-type="super_widget"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('super_widget');
  });
});
describe('ChatGPTMessage row class wiring (RTL mirror)', () => {
  it('wires the user bubble to the right edge and the assistant row to the plain stack', () => {
    const { container } = render(
      <>
        <ChatGPTMessage message={makeMessage()} />
        <ChatGPTMessage message={makeMessage(assistantMessage)} />
      </>,
    );

    const userRow = container.querySelector('[data-role="user"]');
    expect(userRow).toHaveClass(classOf(styles.userRow));

    const assistantRow = container.querySelector('[data-role="assistant"]');
    expect(assistantRow).toHaveClass(classOf(styles.assistantRow));
    expect(assistantRow).not.toHaveClass(classOf(styles.userRow));
  });

  it('keeps reasoning fragments out of the bubble path (they render as ReasoningBlock)', () => {
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'thoughts',
          content: 'بررسی',
          order: 1,
        })}
      />,
    );

    const row = container.querySelector('[data-fragment="thoughts"]');
    expect(row).not.toBeNull();
    expect(row).toHaveClass(classOf(styles.assistantRow));
    expect(row?.querySelector('[data-thinking="embedded"]')).not.toBeNull();
  });

  it('keeps unknown-role rows on the plain block flow without the assistant row class', () => {
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          role: 'unknown',
          kind: 'text',
          content: 'متن',
          sourceFragmentType: 'text',
        })}
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

describe('ChatGPTMessage long user message collapse (11b FR-3)', () => {
  it('shows no toggle and no clamp for a short user message', () => {
    mockOverflow(false);
    const { container } = render(
      <ChatGPTMessage message={makeMessage({ sourceFragmentType: 'text', content: 'سلام' })} />,
    );

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).toBeNull();
  });

  it('collapses a long user message and toggles show more/less', () => {
    mockOverflow(true);
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          sourceFragmentType: 'text',
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
      />,
    );

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
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'نمایش کمتر' }));
    expect(screen.getByRole('button', { name: 'نمایش بیشتر' })).toBeInTheDocument();
    expect(container.querySelector(`.${classOf(styles.userBubbleCollapsed)}`)).not.toBeNull();
  });

  it('never collapses assistant messages', () => {
    mockOverflow(true);
    render(
      <ChatGPTMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'text',
          content: Array.from({ length: 20 }, (_, i) => `خط ${i}`).join('\n'),
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'نمایش کمتر' })).toBeNull();
  });
});

describe('ChatGPTMessage attachment chip (FR-6)', () => {
  it('renders the image-pointer placeholder name with no fabricated size', () => {
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          kind: 'attachment',
          attachments: [{ fileId: 'file-abc', fileName: 'فایل پیوست' }],
          sourceFragmentType: 'image_asset_pointer',
          order: 2,
        })}
      />,
    );

    const chip = container.querySelector('[data-attachment="فایل پیوست"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).not.toContain('بایت');
  });

  it('renders the export size only when the attachment actually carries one', () => {
    const { container } = render(
      <ChatGPTMessage
        message={makeMessage({
          kind: 'attachment',
          attachments: [{ fileId: 'file-1', fileName: 'resume.pdf', fileSize: 1234 }],
          sourceFragmentType: 'attachments',
          order: 2,
        })}
      />,
    );

    expect(container.querySelector('[data-attachment="resume.pdf"]')).not.toBeNull();
    expect(container.textContent).toContain('1.2 ک.ب');
  });
});


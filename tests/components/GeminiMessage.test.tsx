import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GeminiMessage } from '@/themes/gemini/GeminiMessage';
import styles from '@/themes/gemini/GeminiMessage.module.css';
import { makeMessage } from '../fixtures/conversations';

/**
 * Rendered behaviour of the Gemini message renderer (`ui-context.md` §4.5):
 * the user's turn is a text bubble (never HTML), the model's answer is
 * sanitized pre-rendered HTML with a Copy bar on its code blocks, extra drafts
 * surface through the FR11 chip, and the date comes only from the export's own
 * timestamp. The class wiring the alignment test pins statically is asserted
 * here against the rendered rows.
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

const userMessage = makeMessage({ sourceFragmentType: 'title', content: 'سلام' });

const assistantMessage = makeMessage({
  role: 'assistant',
  sourceFragmentType: 'safeHtmlItem',
  content: '<p>پاسخ <strong>مهم</strong></p>',
  createdAt: '2025-03-01T14:30:00.000Z',
});

describe('GeminiMessage — user turn', () => {
  it('renders the text as a bubble on the user row, with Copy', () => {
    const { container } = render(<GeminiMessage message={userMessage} />);

    const row = container.querySelector('[data-role="user"]');
    expect(row).toHaveClass(classOf(styles.userRow));
    expect(screen.getByText('سلام')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'کپی پیام' })).toBeInTheDocument();
  });

  it('never renders user text as HTML — the user side is a plain string', () => {
    render(
      <GeminiMessage
        message={makeMessage({
          sourceFragmentType: 'title',
          content: '<p>متن</p><script>alert(1)</script>',
        })}
      />,
    );

    // The markup is visible as characters, and no element from it exists.
    expect(screen.getByText(/<p>متن<\/p>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('copies the user text verbatim', async () => {
    const { writeText } = stubClipboard();
    render(<GeminiMessage message={userMessage} />);

    fireEvent.click(screen.getByRole('button', { name: 'کپی پیام' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('سلام');
    });
  });
});

describe('GeminiMessage — assistant turn', () => {
  it('renders the sanitized answer as HTML, not as source text', () => {
    const { container } = render(<GeminiMessage message={assistantMessage} />);

    const row = container.querySelector('[data-role="assistant"]');
    expect(row).toHaveClass(classOf(styles.assistantRow));
    expect(container.querySelector('strong')?.textContent).toBe('مهم');
    expect(screen.queryByText(/<p>پاسخ/)).toBeNull();
  });

  it('strips scripts and images from the answer before anything reaches the document', () => {
    const { container } = render(
      <GeminiMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'safeHtmlItem',
          content: '<p>متن</p><script>alert(1)</script><img src="https://evil.example/x.png">',
        })}
      />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('متن');
  });

  it('copies the readable text of the answer, not the export markup', async () => {
    const { writeText } = stubClipboard();
    render(
      <GeminiMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'safeHtmlItem',
          content: '<p>خط اول</p><p>خط دوم</p>',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'کپی پاسخ' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('خط اول\nخط دوم');
    });
  });

  it('gives a top-level code block its own Copy bar and copies the code', async () => {
    const { writeText } = stubClipboard();
    const { container } = render(
      <GeminiMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'safeHtmlItem',
          content: '<p>قبل</p><pre><code>npm run test</code></pre>',
        })}
      />,
    );

    const block = container.querySelector('[data-code-block]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toContain('کد');
    // The inline code stays inline; only the block was lifted out.
    expect(container.querySelectorAll('pre')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'کپی کد' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('npm run test');
    });
  });

  it('shows the export date beside the actions only when the timestamp parses', () => {
    const { container, rerender } = render(<GeminiMessage message={assistantMessage} />);

    const date = container.querySelector('[data-action-date]');
    expect(date).not.toBeNull();
    // Display-formatted (fa-IR), never the raw ISO string the export stores.
    expect(date?.textContent).not.toContain('2025');
    expect(date?.textContent).not.toContain(':');

    rerender(
      <GeminiMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'safeHtmlItem',
          content: '<p>بدون تاریخ</p>',
          createdAt: 'not-a-date',
        })}
      />,
    );
    expect(container.querySelector('[data-action-date]')).toBeNull();
  });
});

describe('GeminiMessage — drafts (FR11, ADR #25)', () => {
  const draftOne = '<p>پیش‌نویس اول</p>';
  const draftTwo = '<p>پیش‌نویس دوم</p>';

  function dualDraftMessage(): ReturnType<typeof makeMessage> {
    return makeMessage({
      role: 'assistant',
      sourceFragmentType: 'safeHtmlItem',
      content: draftOne,
      alternatives: [draftTwo],
    });
  }

  it('renders no toggle for a single-draft answer', () => {
    render(<GeminiMessage message={assistantMessage} />);

    expect(screen.queryByRole('group', { name: 'انتخاب پیش‌نویس پاسخ' })).toBeNull();
  });

  it('starts on the first draft and steps to the second and back', () => {
    render(<GeminiMessage message={dualDraftMessage()} />);

    expect(screen.getByText('پیش‌نویس 1/2')).toBeInTheDocument();
    expect(screen.getByText('پیش‌نویس اول')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس بعدی' }));

    expect(screen.getByText('پیش‌نویس 2/2')).toBeInTheDocument();
    expect(screen.getByText('پیش‌نویس دوم')).toBeInTheDocument();
    expect(screen.queryByText('پیش‌نویس اول')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس قبلی' }));

    expect(screen.getByText('پیش‌نویس اول')).toBeInTheDocument();
  });

  it('copies whichever draft is on screen', async () => {
    const { writeText } = stubClipboard();
    render(<GeminiMessage message={dualDraftMessage()} />);

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس بعدی' }));
    fireEvent.click(screen.getByRole('button', { name: 'کپی پاسخ' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('پیش‌نویس دوم');
    });
  });

  it('clamps a stale draft index instead of rendering an empty answer', () => {
    // Switching conversations reuses a row when its `order` key survives, so a
    // two-draft index must never index past a one-draft message.
    const { rerender } = render(<GeminiMessage message={dualDraftMessage()} />);
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نویس بعدی' }));
    expect(screen.getByText('پیش‌نویس دوم')).toBeInTheDocument();

    rerender(
      <GeminiMessage
        message={makeMessage({
          role: 'assistant',
          sourceFragmentType: 'safeHtmlItem',
          content: '<p>تک‌پاسخ</p>',
        })}
      />,
    );

    expect(screen.getByText('تک‌پاسخ')).toBeInTheDocument();
  });
});

describe('GeminiMessage — attachments and unknown roles', () => {
  it('renders attachment placeholders with no interactive affordance (FR8)', () => {
    const { container } = render(
      <GeminiMessage
        message={makeMessage({
          kind: 'attachment',
          role: 'user',
          sourceFragmentType: 'attachedFiles',
          attachments: [
            { fileId: 'shot-01.jpg', fileName: 'shot-01.jpg' },
            { fileId: 'notes.pdf', fileName: 'notes.pdf' },
          ],
        })}
      />,
    );

    expect(container.querySelector('[data-attachment="shot-01.jpg"]')).not.toBeNull();
    expect(container.querySelector('[data-attachment="notes.pdf"]')).not.toBeNull();
    expect(screen.getByText('shot-01.jpg')).toBeInTheDocument();
    // Nothing to open: the export carries no bytes for these names.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders an unknown role quietly, without actions', () => {
    const { container } = render(
      <GeminiMessage message={makeMessage({ role: 'unknown', sourceFragmentType: 'mystery' })} />,
    );

    expect(container.querySelector('[data-role="unknown"]')).not.toBeNull();
    expect(container.textContent).toContain('پیام با نقش ناشناخته');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
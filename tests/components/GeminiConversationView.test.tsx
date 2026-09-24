import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeminiConversationView } from '@/themes/gemini/GeminiConversationView';
import { makeMessage } from '../fixtures/conversations';
import type { UnifiedConversation } from '@/types/conversation';

/**
 * The Gemini theme module the shell hands the stage: it mounts the tokens, maps
 * the normalized message array onto message rows in the order normalization
 * produced (already ascending — the view never re-sorts), and treats an empty
 * conversation as a valid, explained state rather than an error.
 */

function conversation(messages: UnifiedConversation['messages']): UnifiedConversation {
  return {
    sourceProvider: 'gemini',
    sourceConversationId: 'sample-conv-b',
    title: 'گفتگوی نمونه',
    createdAt: '2025-03-01T14:20:00.000Z',
    updatedAt: '2025-03-01T14:30:00.000Z',
    messages,
  };
}

describe('GeminiConversationView', () => {
  it('renders the themed surface with both sides of a turn, in normalization order', () => {
    const { container } = render(
      <GeminiConversationView
        conversation={conversation([
          makeMessage({ sourceFragmentType: 'title', content: 'متن کاربر', order: 0 }),
          makeMessage({
            role: 'assistant',
            sourceFragmentType: 'safeHtmlItem',
            content: '<p>پاسخ مدل</p>',
            order: 1,
          }),
        ])}
      />,
    );

    expect(container.querySelector('[data-provider-theme="gemini"]')).not.toBeNull();
    expect(screen.getByText('متن کاربر')).toBeInTheDocument();
    expect(container.querySelector('strong')).toBeNull(); // no rich content here
    expect(screen.getByText('پاسخ مدل')).toBeInTheDocument();

    // Array order is the reading order: the user turn first, then the answer.
    const rows = container.querySelectorAll('[data-role]');
    expect(rows[0]).toHaveAttribute('data-role', 'user');
    expect(rows[1]).toHaveAttribute('data-role', 'assistant');
  });

  it('renders an empty conversation as a valid, explained state', () => {
    render(<GeminiConversationView conversation={conversation([])} />);

    expect(screen.getByText('پیامی برای نمایش در این گفتگو نیست.')).toBeInTheDocument();
    expect(document.querySelector('[data-provider-theme="gemini"]')).not.toBeNull();
  });

  it('renders attachment placeholders and the answer of the same turn without a crash', () => {
    const { container } = render(
      <GeminiConversationView
        conversation={conversation([
          makeMessage({ sourceFragmentType: 'title', content: 'تصویر را ببین', order: 0 }),
          makeMessage({
            role: 'assistant',
            sourceFragmentType: 'safeHtmlItem',
            content: '<p>دیدم.</p>',
            order: 1,
          }),
          makeMessage({
            kind: 'attachment',
            role: 'user',
            sourceFragmentType: 'attachedFiles',
            attachments: [{ fileId: 'shot-01.jpg', fileName: 'shot-01.jpg' }],
            order: 2,
          }),
        ])}
      />,
    );

    expect(container.querySelector('[data-attachment="shot-01.jpg"]')).not.toBeNull();
    expect(screen.getByText('دیدم.')).toBeInTheDocument();
  });
});
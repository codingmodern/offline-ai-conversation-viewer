import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeepSeekConversationView } from '@/themes/deepseek/DeepSeekConversationView';
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * View-level behaviour of the DeepSeek theme entry component: the themed
 * surface always renders (empty conversations are valid, not errors), messages
 * keep conversation order across every `kind`, and switching conversations
 * swaps content in place (FR2/NFR2).
 */

describe('DeepSeekConversationView', () => {
  it('marks the surface as the DeepSeek theme', () => {
    const { container } = render(
      <DeepSeekConversationView conversation={makeConversation()} />,
    );

    // The displayed record's identity is carried by the shell's scroll
    // container (`ConversationStage`), not by the theme's own surface.
    expect(container.querySelector('[data-provider-theme="deepseek"]')).not.toBeNull();
  });

  it('renders an empty conversation as a valid themed state, not an error', () => {
    render(
      <DeepSeekConversationView
        conversation={makeConversation({ messages: [] })}
      />,
    );

    expect(screen.getByText('پیامی برای نمایش در این گفتگو نیست.')).toBeInTheDocument();
  });

  it('renders every message kind in conversation order', () => {
    const { container } = render(
      <DeepSeekConversationView
        conversation={makeConversation({
          sourceConversationId: 'rich',
          messages: [
            makeMessage({ content: 'سوال', order: 0 }),
            makeMessage({
              role: 'assistant',
              kind: 'tool_activity',
              sourceFragmentType: 'SEARCH',
              toolActivity: { activityType: 'SEARCH' },
              order: 1,
            }),
            makeMessage({
              role: 'assistant',
              sourceFragmentType: 'THINK',
              content: 'گام',
              order: 2,
            }),
            makeMessage({
              role: 'assistant',
              sourceFragmentType: 'RESPONSE',
              content: 'جواب',
              order: 3,
            }),
          ],
        })}
      />,
    );

    const items = container.querySelectorAll('ol > li');
    expect(items).toHaveLength(4);
    expect(items[0]?.querySelector('[data-role="user"]')).not.toBeNull();
    expect(items[1]?.querySelector('[data-kind="tool_activity"]')).not.toBeNull();
    expect(items[2]?.querySelector('[data-fragment="THINK"]')).not.toBeNull();
    expect(items[3]?.querySelector('[data-role="assistant"]')).not.toBeNull();
    expect(screen.getByText('سوال')).toBeInTheDocument();
    expect(screen.getByText('جواب')).toBeInTheDocument();
  });

  it('swaps the rendered content when a different conversation is passed', () => {
    const first = makeConversation({
      sourceConversationId: 'first',
      messages: [makeMessage({ content: 'پیام اول' })],
    });
    const second = makeConversation({
      sourceConversationId: 'second',
      messages: [makeMessage({ content: 'پیام دوم' })],
    });

    const { container, rerender } = render(
      <DeepSeekConversationView conversation={first} />,
    );
    expect(screen.getByText('پیام اول')).toBeInTheDocument();

    rerender(<DeepSeekConversationView conversation={second} />);

    // Same mounted surface, new conversation: only the content moves; the
    // record identity lives on the shell's stage (see ConversationStage tests).
    expect(screen.getByText('پیام دوم')).toBeInTheDocument();
    expect(screen.queryByText('پیام اول')).not.toBeInTheDocument();
    expect(container.querySelector('[data-provider-theme="deepseek"]')).not.toBeNull();
  });
});

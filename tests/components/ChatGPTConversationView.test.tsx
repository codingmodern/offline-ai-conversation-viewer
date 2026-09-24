import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ChatGPTConversationView } from '@/themes/chatgpt/ChatGPTConversationView';
import { makeConversation, makeMessage } from '../fixtures/conversations';
import type { UnifiedMessage } from '@/types/conversation';

/**
 * End-to-end pins for the unified activity toggle (11b FR-4 + FR-7): ChatGPT's
 * reasoning/tool traffic folds into one `<details>` per contiguous run, text
 * between runs stays outside any toggle, a conversation without background
 * activity shows no toggle at all, and a single Thread Date Line renders above
 * the messages. Parser/normalization are untouched — the fixtures below use the
 * 1-fragment-=-1-message shape normalization produces (no `toolUseId` exists in
 * ChatGPT data, so there is no pairing step to mirror).
 */

function reasoning(order: number): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'text',
    content: 'بررسی درخواست',
    sourceFragmentType: 'thoughts',
    order,
  });
}

function response(order: number): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'text',
    content: 'پاسخ نهایی',
    sourceFragmentType: 'text',
    order,
  });
}

function toolStep(order: number, toolName?: string): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'code',
    order,
    ...(toolName === undefined
      ? { toolActivity: { activityType: 'code', toolInput: 'print(1)' } }
      : { toolActivity: { activityType: 'code', toolName, toolInput: 'print(1)' } }),
  });
}

describe('ChatGPTConversationView unified activity toggle (11b)', () => {
  it('folds reasoning plus tool steps into one toggle, final text outside it', () => {
    const conversation = makeConversation({
      messages: [reasoning(0), toolStep(1, 'python'), toolStep(2), response(3)],
    });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('تفکر, python');
    // The group and the final text are the only remaining top-level list items
    // for four messages. (The class is CSS-module-hashed, so no `.messages`
    // selector works here.)
    expect(container.querySelector('ol')?.childElementCount).toBe(2);
    const listText = container.querySelector('ol')?.textContent ?? '';
    expect(listText).toContain('پاسخ نهایی');
    expect(groups[0]?.textContent).not.toContain('پاسخ نهایی');
  });

  it('renders two toggles when text splits two activity runs (spec §6)', () => {
    const conversation = makeConversation({
      messages: [toolStep(0, 'python'), response(1), toolStep(2, 'bash_tool')],
    });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('python');
    expect(groups[1]?.querySelector('summary')?.textContent).toContain('bash_tool');
  });

  it('renders no toggle when there is no background activity (FR-7)', () => {
    const conversation = makeConversation({ messages: [response(0)] });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    expect(container.querySelectorAll('[data-activity-group]')).toHaveLength(0);
  });

  it('renders a lone reasoning message as its own تفکر toggle (spec §6)', () => {
    const conversation = makeConversation({ messages: [reasoning(0), response(1)] });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('تفکر');
  });

  it('renders the Thread Date Line once, above the messages, never as raw ISO', () => {
    const conversation = makeConversation({
      createdAt: '2026-09-21T10:30:00.000Z',
      messages: [response(0), response(1)],
    });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    const dates = container.querySelectorAll('[data-thread-date]');
    expect(dates).toHaveLength(1);
    expect(dates[0]?.textContent).not.toContain('2026-09-21');
    expect(container.querySelector('ol')?.previousElementSibling).toBe(dates[0]);
  });

  it('renders no Thread Date Line when the export carries no parseable time', () => {
    const withoutTime = makeConversation({ messages: [response(0)] });
    const { container } = render(<ChatGPTConversationView conversation={withoutTime} />);
    expect(container.querySelectorAll('[data-thread-date]')).toHaveLength(0);

    const brokenTime = makeConversation({ createdAt: 'not-a-date', messages: [response(0)] });
    const { container: second } = render(<ChatGPTConversationView conversation={brokenTime} />);
    expect(second.querySelectorAll('[data-thread-date]')).toHaveLength(0);
  });

  it('renders the explanatory line for an empty conversation (spec Edge Cases)', () => {
    const conversation = makeConversation({ messages: [] });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    expect(container.querySelector('[data-empty]')).not.toBeNull();
    expect(container.querySelector('ol')).toBeNull();
  });

  it('renders the theme on the chatgpt namespace', () => {
    const conversation = makeConversation({ messages: [response(0)] });
    const { container } = render(<ChatGPTConversationView conversation={conversation} />);

    expect(container.querySelector('[data-provider-theme="chatgpt"]')).not.toBeNull();
  });
});

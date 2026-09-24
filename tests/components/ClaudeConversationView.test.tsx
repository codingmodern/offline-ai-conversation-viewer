import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ClaudeConversationView } from '@/themes/claude/ClaudeConversationView';
import { makeConversation, makeMessage } from '../fixtures/conversations';
import type { UnifiedMessage } from '@/types/conversation';

/**
 * End-to-end pins for the unified activity toggle
 * (`09c-claude-unified-activity-toggle.md` §5 + FR7): thinking/tool traffic
 * folds into one `<details>` per contiguous run, text between runs stays
 * outside any toggle, and a conversation without background activity shows
 * no toggle at all. Parser/normalization are untouched — the fixtures below
 * already use the 1-fragment-=-1-message shape normalization produces.
 */

function thinking(order: number): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'text',
    content: 'reasoning',
    sourceFragmentType: 'thinking',
    order,
  });
}

function response(order: number): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'text',
    content: 'final answer',
    sourceFragmentType: 'text',
    order,
  });
}

function toolUse(order: number, id: string, toolName = 'web_search'): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'tool_use',
    order,
    toolActivity: { activityType: 'tool_use', toolUseId: id, toolName, toolInput: { q: 1 } },
  });
}

function toolResult(order: number, id: string): UnifiedMessage {
  return makeMessage({
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'tool_result',
    order,
    toolActivity: {
      activityType: 'tool_result',
      toolUseId: id,
      toolOutput: [{ type: 'text', text: 'out' }],
    },
  });
}

describe('ClaudeConversationView unified activity toggle (09c)', () => {
  it('folds thinking plus a paired tool into one toggle, final text outside it', () => {
    const conversation = makeConversation({
      messages: [thinking(0), toolUse(1, 't1'), toolResult(2, 't1'), response(3)],
    });
    const { container } = render(<ClaudeConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('تفکر, web_search');
    // The merged result row disappears into the tool card; the group and the
    // final text are the only remaining top-level list items for four
    // messages. (The thinking steps are their own nested <ol>; childElementCount
    // counts only direct children. The class is CSS-module-hashed, so no
    // `.messages` selector works here.)
    expect(container.querySelector('ol')?.childElementCount).toBe(2);
    const listText = container.querySelector('ol')?.textContent ?? '';
    expect(listText).toContain('final answer');
    expect(groups[0]?.textContent).not.toContain('final answer');
  });

  it('renders two toggles when text splits two activity runs (spec §6)', () => {
    const conversation = makeConversation({
      messages: [toolUse(0, 't0'), response(1), toolUse(2, 't2', 'bash_tool')],
    });
    const { container } = render(<ClaudeConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('web_search');
    expect(groups[1]?.querySelector('summary')?.textContent).toContain('bash_tool');
  });

  it('renders no toggle when there is no background activity (FR7)', () => {
    const conversation = makeConversation({ messages: [response(0)] });
    const { container } = render(<ClaudeConversationView conversation={conversation} />);

    expect(container.querySelectorAll('[data-activity-group]')).toHaveLength(0);
  });

  it('renders a lone thinking block as its own تفکر toggle (spec §6)', () => {
    const conversation = makeConversation({ messages: [thinking(0), response(1)] });
    const { container } = render(<ClaudeConversationView conversation={conversation} />);

    const groups = container.querySelectorAll('[data-activity-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.querySelector('summary')?.textContent).toContain('تفکر');
  });
});

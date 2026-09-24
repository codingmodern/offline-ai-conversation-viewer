import { describe, expect, it } from 'vitest';
import type { UnifiedMessage } from '@/types/conversation';
import { linkToolActivity } from '@/themes/claude/toolLinking';

/**
 * The pairing rule the tool cards depend on: a `tool_use` message absorbs its
 * `tool_result` (matched by `toolUseId`) into one card, and the result message
 * is marked merged so the view skips it — display-only, nothing dropped.
 */

function use(order: number, id: string): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'tool_use',
    order,
    toolActivity: { activityType: 'tool_use', toolUseId: id, toolName: 'web_search', toolInput: { q: 1 } },
  };
}

function result(order: number, id: string, isError?: boolean): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'tool_result',
    order,
    toolActivity: {
      activityType: 'tool_result',
      toolUseId: id,
      toolOutput: [{ type: 'text', text: 'out' }],
      ...(isError === undefined ? {} : { toolIsError: isError }),
    },
  };
}

describe('linkToolActivity', () => {
  it('pairs a tool_use with its tool_result and marks the result merged', () => {
    const { cards, mergedOrders } = linkToolActivity([use(0, 't1'), result(1, 't1')]);

    expect(mergedOrders).toEqual(new Set([1]));
    expect(cards.get(0)).toMatchObject({
      toolName: 'web_search',
      input: { q: 1 },
      output: [{ type: 'text', text: 'out' }],
      hasResult: true,
    });
  });

  it('carries the error flag from the result onto the card', () => {
    const { cards } = linkToolActivity([use(0, 't1'), result(1, 't1', true)]);

    expect(cards.get(0)?.isError).toBe(true);
  });

  it('keeps an unpaired tool_use as a card without an output section', () => {
    const { cards, mergedOrders } = linkToolActivity([use(0, 't1')]);

    expect(mergedOrders.size).toBe(0);
    expect(cards.get(0)).toMatchObject({ toolName: 'web_search', hasResult: false });
    expect(cards.get(0)).not.toHaveProperty('output');
  });

  it('renders a standalone tool_result rather than dropping it', () => {
    const { cards, mergedOrders } = linkToolActivity([result(0, 'orphan')]);

    expect(mergedOrders.size).toBe(0);
    expect(cards.get(0)).toMatchObject({
      output: [{ type: 'text', text: 'out' }],
      hasResult: true,
    });
  });

  it('ignores non-tool messages entirely', () => {
    const text: UnifiedMessage = {
      role: 'user',
      kind: 'text',
      sourceFragmentType: 'text',
      content: 'سلام',
      order: 0,
    };

    const { cards, mergedOrders } = linkToolActivity([text]);

    expect(cards.size).toBe(0);
    expect(mergedOrders.size).toBe(0);
  });
});

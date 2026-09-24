import { describe, expect, it } from 'vitest';
import type { UnifiedMessage } from '@/types/conversation';
import type { ToolCardView } from '@/themes/claude/toolLinking';
import { groupActivityRuns } from '@/themes/claude/activityGrouping';

/**
 * The contiguous-run rule behind the unified activity toggle
 * (`09c-claude-unified-activity-toggle.md`, spec §5 validation): every
 * *visible* message (after `linkToolActivity`'s merged-result removal) that
 * renders background activity — `tool_activity`, or `text` carrying the
 * `thinking` fragment type — joins the current run; everything else
 * (assistant/user text, attachments, unknown fragments) closes it. Each
 * message lands in exactly one sequence item, in order, so nothing is
 * dropped and text between runs stays outside any toggle.
 */

function thinking(order: number): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'text',
    content: 'reasoning',
    sourceFragmentType: 'thinking',
    order,
  };
}

function text(order: number, role: 'assistant' | 'user' = 'assistant'): UnifiedMessage {
  return {
    role,
    kind: 'text',
    content: 'hello',
    sourceFragmentType: 'text',
    order,
  };
}

function tool(order: number, toolName = 'web_search'): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'tool_use',
    order,
    toolActivity: { activityType: 'tool_use', toolUseId: `t${order}`, toolName },
  };
}

function cardsFor(orders: readonly number[]): ReadonlyMap<number, ToolCardView> {
  return new Map(orders.map((order) => [order, { toolName: 'web_search', hasResult: false }]));
}

function cardsWithNames(entries: ReadonlyArray<readonly [number, string]>): ReadonlyMap<number, ToolCardView> {
  return new Map(entries.map(([order, toolName]) => [order, { toolName, hasResult: false }]));
}

describe('groupActivityRuns', () => {
  it('folds thinking plus tools into one run with تفکر first in the summary', () => {
    const items = groupActivityRuns(
      [thinking(0), tool(1), tool(2, 'bash_tool')],
      cardsWithNames([
        [1, 'web_search'],
        [2, 'bash_tool'],
      ]),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('run');
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(items[0].run.firstOrder).toBe(0);
    expect(items[0].run.hasThinking).toBe(true);
    expect(items[0].run.summary).toBe('تفکر, web_search, bash_tool');
  });

  it('gives a thinking-only run the تفکر summary (spec §6)', () => {
    const items = groupActivityRuns([thinking(0)], new Map());

    expect(items).toHaveLength(1);
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.summary).toBe('تفکر');
  });

  it('gives a single tool the plain tool-name summary with no special case (spec §6)', () => {
    const items = groupActivityRuns([tool(0)], cardsFor([0]));

    expect(items).toHaveLength(1);
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.hasThinking).toBe(false);
    expect(items[0].run.summary).toBe('web_search');
  });

  it('splits runs on text so text stays outside the toggle (spec §5)', () => {
    const items = groupActivityRuns(
      [tool(0), text(1), tool(2)],
      cardsFor([0, 2]),
    );

    expect(items.map((item) => item.kind)).toEqual(['run', 'message', 'run']);
    if (items[0]?.kind !== 'run' || items[1]?.kind !== 'message' || items[2]?.kind !== 'run') {
      throw new Error('expected run, message, run');
    }
    expect(items[0].run.messages.map((message) => message.order)).toEqual([0]);
    expect(items[1].message.order).toBe(1);
    expect(items[2].run.messages.map((message) => message.order)).toEqual([2]);
  });

  it('splits runs on user text and attachments as well', () => {
    const attachment: UnifiedMessage = {
      role: 'user',
      kind: 'attachment',
      attachments: [{ fileId: 'f', fileName: 'a.txt' }],
      sourceFragmentType: 'file_upload',
      order: 1,
    };
    const items = groupActivityRuns([tool(0), attachment, thinking(2)], cardsFor([0]));

    expect(items.map((item) => item.kind)).toEqual(['run', 'message', 'run']);
  });

  it('renders no toggle for messages without background activity (FR7)', () => {
    const items = groupActivityRuns([text(0), text(1, 'user')], new Map());

    expect(items.map((item) => item.kind)).toEqual(['message', 'message']);
  });

  it('keeps a standalone result inside its run without contributing a name', () => {
    const orphan: UnifiedMessage = {
      role: 'assistant',
      kind: 'tool_activity',
      sourceFragmentType: 'tool_result',
      order: 0,
      toolActivity: { activityType: 'tool_result', toolUseId: 'missing' },
    };
    const items = groupActivityRuns([orphan, tool(1)], cardsFor([1]));

    expect(items).toHaveLength(1);
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.messages).toHaveLength(2);
    expect(items[0].run.summary).toBe('web_search');
  });

  it('falls back to ابزار for an unnamed tool, like ToolBlock', () => {
    const unnamed = tool(0);
    const withoutName = new Map<number, ToolCardView>([[0, { hasResult: false }]]);
    const namedRun = groupActivityRuns([unnamed], withoutName);

    expect(namedRun[0]?.kind).toBe('run');
    if (namedRun[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(namedRun[0].run.summary).toBe('ابزار');
  });

  it('returns an empty sequence for an empty conversation', () => {
    expect(groupActivityRuns([], new Map())).toEqual([]);
  });
});

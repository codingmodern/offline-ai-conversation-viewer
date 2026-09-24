import { describe, expect, it } from 'vitest';
import type { UnifiedMessage } from '@/types/conversation';
import { groupActivityRuns } from '@/themes/chatgpt/activityGrouping';

/**
 * The contiguous-run rule behind the unified activity toggle (11b FR-4 /
 * ADR-K): every message that renders background activity — `tool_activity`, or
 * `text` carrying one of ChatGPT's reasoning fragment types (`thoughts`,
 * `reasoning_recap`, `commentary`) — joins the current run; everything else
 * (assistant/user text, attachments, unknown fragments) closes it. Each message
 * lands in exactly one sequence item, in order, so nothing is dropped and text
 * between runs stays outside any toggle.
 *
 * Identical to the Claude theme's grouping except for the two 11a facts this
 * copy is built on: no `toolUseId` (so there is no `cards` map and no merged
 * orders to filter) and the reasoning types above.
 */

function reasoning(order: number): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'text',
    content: 'بررسی درخواست',
    sourceFragmentType: 'thoughts',
    order,
  };
}

function recap(order: number): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'text',
    content: 'خلاصه',
    sourceFragmentType: 'reasoning_recap',
    order,
  };
}

function commentary(order: number): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'text',
    content: 'در حال جستجو',
    sourceFragmentType: 'commentary',
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

function tool(order: number, toolName?: string): UnifiedMessage {
  return {
    role: 'assistant',
    kind: 'tool_activity',
    sourceFragmentType: 'code',
    order,
    ...(toolName === undefined
      ? { toolActivity: { activityType: 'code', toolInput: 'print(1)' } }
      : { toolActivity: { activityType: 'code', toolName, toolInput: 'print(1)' } }),
  };
}

describe('groupActivityRuns (chatgpt)', () => {
  it('folds reasoning plus tool steps into one run with تفکر first in the summary', () => {
    const items = groupActivityRuns([reasoning(0), tool(1, 'python'), tool(2, 'bash_tool')]);

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('run');
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(items[0].run.firstOrder).toBe(0);
    expect(items[0].run.hasReasoning).toBe(true);
    expect(items[0].run.summary).toBe('تفکر, python, bash_tool');
  });

  it('groups all three reasoning fragment types (11b Q2)', () => {
    const items = groupActivityRuns([reasoning(0), recap(1), commentary(2)]);

    expect(items).toHaveLength(1);
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.messages.map((message) => message.order)).toEqual([0, 1, 2]);
    expect(items[0].run.hasReasoning).toBe(true);
    expect(items[0].run.summary).toBe('تفکر');
  });

  it('gives a tool-only run the plain tool-name summary with no تفکر prefix', () => {
    const items = groupActivityRuns([tool(0, 'python')]);

    expect(items).toHaveLength(1);
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.hasReasoning).toBe(false);
    expect(items[0].run.summary).toBe('python');
  });

  it('splits runs on text so text stays outside the toggle (spec §5)', () => {
    const items = groupActivityRuns([tool(0, 'python'), text(1), tool(2, 'bash_tool')]);

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
      sourceFragmentType: 'attachments',
      order: 1,
    };
    const items = groupActivityRuns([tool(0, 'python'), attachment, reasoning(2)]);

    expect(items.map((item) => item.kind)).toEqual(['run', 'message', 'run']);
  });

  it('renders no toggle for messages without background activity (FR-7)', () => {
    const items = groupActivityRuns([text(0), text(1, 'user')]);

    expect(items.map((item) => item.kind)).toEqual(['message', 'message']);
  });

  it('falls back to ابزار for an unnamed tool, like ToolRow', () => {
    const items = groupActivityRuns([tool(0)]);

    expect(items[0]?.kind).toBe('run');
    if (items[0]?.kind !== 'run') {
      throw new Error('expected a single run');
    }
    expect(items[0].run.summary).toBe('ابزار');
  });

  it('returns an empty sequence for an empty conversation', () => {
    expect(groupActivityRuns([])).toEqual([]);
  });
});

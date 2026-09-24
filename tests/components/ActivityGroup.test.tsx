import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ActivityRun } from '@/themes/claude/activityGrouping';
import type { ToolCardView } from '@/themes/claude/toolLinking';
import { ActivityGroup } from '@/themes/claude/ActivityGroup';
import { makeMessage } from '../fixtures/conversations';

/**
 * The unified activity toggle contract (`09c-claude-unified-activity-toggle.md`
 * FR2–FR6): each contiguous thinking/tool run renders exactly one `<details>`
 * whose collapsed summary lists the tools («تفکر» first), and expanding it
 * shows every member in order — thinking plus each tool step — without any
 * nested toggle of its own. The «خطا» badge travels inside the group.
 */

function runWith(summary: string, memberOrders: readonly number[]): ActivityRun {
  return {
    messages: memberOrders.map((order) =>
      makeMessage({ role: 'assistant', kind: 'text', sourceFragmentType: 'text', order }),
    ),
    firstOrder: memberOrders[0] ?? 0,
    hasThinking: false,
    summary,
  };
}

describe('ActivityGroup unified toggle (09c)', () => {
  it('renders exactly one details with the run summary line', () => {
    const run = runWith('تفکر, web_search', [0, 1]);
    const toolCards = new Map<number, ToolCardView>([
      [1, { toolName: 'web_search', input: { q: 1 }, hasResult: false }],
    ]);
    const thinkingRun: ActivityRun = {
      ...run,
      messages: [
        makeMessage({
          role: 'assistant',
          kind: 'text',
          content: 'reasoning step',
          sourceFragmentType: 'thinking',
          order: 0,
        }),
        makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'tool_use',
          order: 1,
          toolActivity: { activityType: 'tool_use', toolUseId: 't1', toolName: 'web_search' },
        }),
      ],
      hasThinking: true,
    };
    const { container } = render(<ActivityGroup run={thinkingRun} toolCards={toolCards} />);

    const group = container.querySelector('[data-activity-group]');
    expect(group?.tagName.toLowerCase()).toBe('details');
    expect(group?.querySelector('summary')?.textContent).toContain('تفکر, web_search');
    // One group toggle — the members contribute no nested details of their own.
    expect(group?.querySelectorAll('details')).toHaveLength(0);
    expect(group?.textContent).toContain('reasoning step');
  });

  it('shows tool input and output inside the expanded group, in order', () => {
    const run: ActivityRun = {
      messages: [
        makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'tool_use',
          order: 0,
          toolActivity: { activityType: 'tool_use', toolUseId: 't0', toolName: 'web_search' },
        }),
        makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'tool_use',
          order: 1,
          toolActivity: { activityType: 'tool_use', toolUseId: 't1', toolName: 'bash_tool' },
        }),
      ],
      firstOrder: 0,
      hasThinking: false,
      summary: 'web_search, bash_tool',
    };
    const toolCards = new Map<number, ToolCardView>([
      [0, { toolName: 'web_search', input: { q: 'q0' }, output: 'out0', hasResult: true }],
      [1, { toolName: 'bash_tool', input: { cmd: 'ls' }, output: 'out1', hasResult: true }],
    ]);
    const { container } = render(<ActivityGroup run={run} toolCards={toolCards} />);

    const body = container.querySelector('[data-activity-group]')?.textContent ?? '';
    expect(body.indexOf('web_search')).toBeLessThan(body.indexOf('bash_tool'));
    expect(body).toContain('out0');
    expect(body).toContain('out1');
  });

  it('keeps the error badge on a failed tool inside the shared group', () => {
    const run = runWith('web_search', [0]);
    const toolCards = new Map<number, ToolCardView>([
      [0, { toolName: 'web_search', output: 'boom', isError: true, hasResult: true }],
    ]);
    const errorRun: ActivityRun = {
      ...run,
      messages: [
        makeMessage({
          role: 'assistant',
          kind: 'tool_activity',
          sourceFragmentType: 'tool_use',
          order: 0,
          toolActivity: { activityType: 'tool_use', toolUseId: 't0', toolName: 'web_search' },
        }),
      ],
    };
    const { container } = render(<ActivityGroup run={errorRun} toolCards={toolCards} />);

    const failed = container.querySelector('[data-tool-state="error"]');
    expect(failed).not.toBeNull();
    expect(container.querySelectorAll('[data-activity-group]')).toHaveLength(1);
    expect(failed?.textContent).toContain('خطا');
  });

  it('marks the row as an assistant activity group', () => {
    const { container } = render(<ActivityGroup run={runWith('web_search', [0])} toolCards={new Map()} />);

    const row = container.querySelector('[data-kind="activity_group"]');
    expect(row?.getAttribute('data-role')).toBe('assistant');
  });
});

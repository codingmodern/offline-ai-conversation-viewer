import type { UnifiedMessage } from '@/types/conversation';

/**
 * Pairs Claude's `tool_use` invocation with its `tool_result` outcome so the
 * theme can render one tool card instead of two orphan rows.
 *
 * Why pairing is needed at the *conversation* level: normalization keeps
 * 1 fragment = 1 message (spec 09), so an invocation and its result arrive as
 * two separate `tool_activity` messages, linked only by the shared
 * `toolUseId`. Claude's own UI shows the result *inside* the tool card, so the
 * theme merges them at render time.
 *
 * Merging is display-only, never destructive: the result message's payload is
 * shown inside the invocation card, and `mergedOrders` lets the view skip the
 * now-embedded result row. Nothing is dropped — search never reads
 * `tool_activity` messages (ADR #18), and the unified model stays untouched.
 *
 * A `tool_use` whose result never arrives (truncated export) still renders —
 * as an invocation card without an output section. A `tool_result` with no
 * matching invocation renders on its own rather than vanishing.
 */
export interface ToolCardView {
  /** The tool's own name, e.g. `web_search`; absent when the export had none. */
  readonly toolName?: string;
  /** Verbatim `input` of the invocation, when it carried one. */
  readonly input?: unknown;
  /** Verbatim `content` of the result, when one was linked or carried inline. */
  readonly output?: unknown;
  /** The result's `is_error` flag. */
  readonly isError?: boolean;
  /** Whether a result section exists at all (drives the output area). */
  readonly hasResult: boolean;
}

export interface ToolLinking {
  /** Per-message card views, keyed by the `tool_use` message's `order`. */
  readonly cards: ReadonlyMap<number, ToolCardView>;
  /** Orders of `tool_result` messages already merged into an invocation card. */
  readonly mergedOrders: ReadonlySet<number>;
}

export function linkToolActivity(
  messages: readonly UnifiedMessage[],
): ToolLinking {
  const resultsById = new Map<
    string,
    { readonly output?: unknown; readonly isError?: boolean; readonly order: number }
  >();

  for (const message of messages) {
    if (message.kind !== 'tool_activity') {
      continue;
    }
    const activity = message.toolActivity;
    if (
      activity === undefined ||
      activity.activityType !== 'tool_result' ||
      activity.toolUseId === undefined
    ) {
      continue;
    }
    resultsById.set(activity.toolUseId, {
      ...(activity.toolOutput === undefined ? {} : { output: activity.toolOutput }),
      ...(activity.toolIsError === undefined ? {} : { isError: activity.toolIsError }),
      order: message.order,
    });
  }

  const cards = new Map<number, ToolCardView>();
  const mergedOrders = new Set<number>();

  for (const message of messages) {
    if (message.kind !== 'tool_activity') {
      continue;
    }
    const activity = message.toolActivity;
    if (activity === undefined) {
      continue;
    }

    if (activity.activityType === 'tool_use' && activity.toolUseId !== undefined) {
      const result = resultsById.get(activity.toolUseId);
      if (result !== undefined) {
        mergedOrders.add(result.order);
        cards.set(message.order, {
          ...(activity.toolName === undefined ? {} : { toolName: activity.toolName }),
          ...(activity.toolInput === undefined ? {} : { input: activity.toolInput }),
          ...(result.output === undefined ? {} : { output: result.output }),
          ...(result.isError === undefined ? {} : { isError: result.isError }),
          hasResult: true,
        });
        continue;
      }
    }

    // Unpaired invocation, standalone result, or an unknown future activity
    // type: rendered as-is, never dropped.
    cards.set(message.order, {
      ...(activity.toolName === undefined ? {} : { toolName: activity.toolName }),
      ...(activity.activityType === 'tool_use' && activity.toolInput !== undefined
        ? { input: activity.toolInput }
        : {}),
      ...(activity.activityType === 'tool_result' && activity.toolOutput !== undefined
        ? { output: activity.toolOutput }
        : {}),
      ...(activity.toolIsError === undefined ? {} : { isError: activity.toolIsError }),
      hasResult: activity.activityType === 'tool_result',
    });
  }

  return { cards, mergedOrders };
}

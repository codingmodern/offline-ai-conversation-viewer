import type { UnifiedMessage } from '@/types/conversation';
import i18n from '@/i18n';
import type { ToolCardView } from './toolLinking';

/**
 * Groups a Claude response's contiguous background activity — thinking and
 * tool traffic — into the single toggle the real claude.ai shows
 * (`09c-claude-unified-activity-toggle.md`). `linkToolActivity` has already
 * paired each `tool_use` with its `tool_result`; this pass runs on the
 * *visible* message sequence (the view drops merged results first), so a run
 * is exactly the continuous block of activity the user sees between two text
 * segments — not the original `content[]` boundary, which normalization
 * intentionally dissolved (1 fragment = 1 message).
 *
 * A member is any message that renders activity inside the group:
 *   - `kind === 'tool_activity'` — one tool step;
 *   - `kind === 'text'` with `sourceFragmentType === 'thinking'` — one
 *     reasoning block (visible bodies and hidden-with-summary variants both
 *     carry the fragment type through normalization).
 * Everything else — assistant/user text, attachments, unknown fragments —
 * closes the run. A run of one message is still a group: a lone «تفکر» or a
 * single tool call keeps the same single toggle (spec 09c §6).
 *
 * Nothing is dropped: every visible message lands in exactly one sequence
 * item, in order.
 */

/** One contiguous activity run, rendered as a single `<details>`. */
export interface ActivityRun {
  /** Member messages in occurrence order. Never empty. */
  readonly messages: readonly UnifiedMessage[];
  /** The first member's `order` — unique key for the group's list item. */
  readonly firstOrder: number;
  /** Does the run contain at least one thinking fragment? */
  readonly hasThinking: boolean;
  /** Collapsed summary line — tool names comma-joined, «تفکر» first. */
  readonly summary: string;
}

/** A visible message rendered on its own, or a run rendered as one toggle. */
export type ActivitySequenceItem =
  | { readonly kind: 'message'; readonly message: UnifiedMessage }
  | { readonly kind: 'run'; readonly run: ActivityRun };

/**
 * Translation key for the summary's label on a reasoning block, first when
 * thinking is present (Unit 12). Resolved through the i18next singleton at each
 * build, so a language switch re-renders the view and every summary rebuilds in
 * the new language.
 */
const THINKING_LABEL_KEY = 'themes.reasoningLabel';

/** Translation key for the generic tool name, when the export carried none. */
const FALLBACK_TOOL_NAME_KEY = 'themes.toolFallback';

function isActivityMessage(message: UnifiedMessage): boolean {
  return (
    message.kind === 'tool_activity' ||
    (message.kind === 'text' && message.sourceFragmentType === 'thinking')
  );
}

/**
 * The tool's display name for the summary line — same `ابزار` fallback as
 * `ToolBlock`, so the label never invents a name the export didn't carry.
 * A member whose card is missing renders nothing anyway, so it contributes
 * no name either.
 */
function toolNameFor(
  message: UnifiedMessage,
  toolCards: ReadonlyMap<number, ToolCardView>,
): string | undefined {
  if (message.kind !== 'tool_activity') {
    return undefined;
  }
  const card = toolCards.get(message.order);
  return card === undefined ? undefined : (card.toolName ?? i18n.t(FALLBACK_TOOL_NAME_KEY));
}

function buildSummary(hasThinking: boolean, toolNames: readonly string[]): string {
  const parts: string[] = [];
  if (hasThinking) {
    parts.push(i18n.t(THINKING_LABEL_KEY));
  }
  parts.push(...toolNames);
  return parts.join(', ');
}

export function groupActivityRuns(
  visibleMessages: readonly UnifiedMessage[],
  toolCards: ReadonlyMap<number, ToolCardView>,
): readonly ActivitySequenceItem[] {
  const items: ActivitySequenceItem[] = [];
  let run: UnifiedMessage[] = [];
  let runFirstOrder: number | undefined;
  let hasThinking = false;
  let toolNames: string[] = [];

  const flush = (): void => {
    if (run.length === 0) {
      return;
    }
    if (runFirstOrder === undefined) {
      return;
    }
    items.push({
      kind: 'run',
      run: {
        messages: run,
        firstOrder: runFirstOrder,
        hasThinking,
        summary: buildSummary(hasThinking, toolNames),
      },
    });
    run = [];
    runFirstOrder = undefined;
    hasThinking = false;
    toolNames = [];
  };

  for (const message of visibleMessages) {
    if (!isActivityMessage(message)) {
      flush();
      items.push({ kind: 'message', message });
      continue;
    }
    if (run.length === 0) {
      runFirstOrder = message.order;
    }
    run.push(message);
    if (message.kind === 'text') {
      hasThinking = true;
    } else {
      const name = toolNameFor(message, toolCards);
      if (name !== undefined) {
        toolNames.push(name);
      }
    }
  }
  flush();
  return items;
}

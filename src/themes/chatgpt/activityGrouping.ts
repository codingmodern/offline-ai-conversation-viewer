import type { UnifiedMessage } from '@/types/conversation';
import i18n from '@/i18n';

/**
 * ChatGPT's reasoning and tool‑activity values (11b FR‑4 / Q2).
 *
 * 11a emits reasoning only as `kind: 'text', role: 'assistant'` with one of
 * these `sourceFragmentType` values (never `thinking`, which is DeepSeek's):
 *   - `thoughts`           → content_type `thoughts`
 *   - `reasoning_recap`    → content_type `reasoning_recap`
 *   - `commentary`         → an assistant `text`/`multimodal_text` message whose
 *                            `channel` is `"commentary"` (the channel replaces the
 *                            type on the text path).
 * `text` and `multimodal_text` are ordinary assistant text and must NOT join a
 * run; every `tool_activity` message joins a run by `kind`, so tool rows never
 * read these strings.
 */
export const REASONING_FRAGMENT_TYPES: ReadonlySet<string> = new Set([
  'thoughts',
  'reasoning_recap',
  'commentary',
]);

/**
 * Translation key for the label the collapsed summary leads with when reasoning
 * is present (Unit 12). The wording lives in `locales/{lng}/common.json`; the
 * summary is resolved **per render** through the i18next singleton, which is what
 * lets an already-grouped run re-read its label when the language changes —
 * `groupActivityRuns` runs in the view's render body, so switching the language
 * rebuilds every summary on the next render.
 */
export const REASONING_LABEL_KEY = 'themes.reasoningLabel';

/** Translation key for the row's name when the export carried none — shared with ToolRow. */
export const FALLBACK_TOOL_NAME_KEY = 'themes.toolFallback';

/** A message renders as background activity (tool call + reasoning). */
function isActivityMessage(message: UnifiedMessage): boolean {
  return (
    message.kind === 'tool_activity' ||
    (message.kind === 'text' && REASONING_FRAGMENT_TYPES.has(message.sourceFragmentType))
  );
}

/**
 * The tool's display name for the summary line — the activity's own `toolName`
 * when the export carried one, else the `ابزار` fallback `ToolRow` renders, so
 * the collapsed line always names the row it hides (FR-5). Never a fabricated
 * name: the fallback is the same generic label the row itself uses.
 */
function toolNameFor(message: UnifiedMessage): string {
  if (message.kind !== 'tool_activity') {
    return i18n.t(FALLBACK_TOOL_NAME_KEY);
  }
  return message.toolActivity?.toolName ?? i18n.t(FALLBACK_TOOL_NAME_KEY);
}

function buildSummary(hasReasoning: boolean, toolNames: readonly string[]): string {
  const parts: string[] = [];
  if (hasReasoning) {
    parts.push(i18n.t(REASONING_LABEL_KEY));
  }
  parts.push(...toolNames);
  return parts.join(', ');
}

/** One contiguous reasoning/tool run, rendered as a single `<details>`. */
export interface ActivityRun {
  /** Member messages in occurrence order. Never empty. */
  readonly messages: readonly UnifiedMessage[];
  /** The first member's `order` — unique key for the group's list item. */
  readonly firstOrder: number;
  /** Does the run contain at least one reasoning fragment? */
  readonly hasReasoning: boolean;
  /** Collapsed summary line — tool names comma-joined, «تفکر» first. */
  readonly summary: string;
}

/** A visible message rendered on its own, or a run rendered as one toggle. */
export type ActivitySequenceItem =
  | { readonly kind: 'message'; readonly message: UnifiedMessage }
  | { readonly kind: 'run'; readonly run: ActivityRun };

/**
 * Folds ChatGPT's contiguous reasoning/tool activity into the single toggle the
 * real UI shows. This is the copy‑and‑restyle of Claude's
 * `activityGrouping.ts` (11b FR‑4 / ADR‑K): the *smallest* Claude copy that
 * works without tool‑use ids.
 *
 * The only difference from Claude is that there is no `toolCards` map and no
 * id pairing — 11a emits no `toolUseId` — so `toolNameFor` reads the name
 * straight off the message. Everything else (the linear run/flush scan, the
 * run‑of‑one rule, "a run of one message is still a group", and the
 * `«تفکر»`-first summary) is identical so the two themes stay in lockstep.
 *
 * Nothing is dropped: every visible message lands in exactly one sequence
 * item, in order. Text messages and attachments close a run the way Claude's do.
 */
export function groupActivityRuns(
  visibleMessages: readonly UnifiedMessage[],
): readonly ActivitySequenceItem[] {
  const items: ActivitySequenceItem[] = [];
  let run: UnifiedMessage[] = [];
  let runFirstOrder: number | undefined;
  let hasReasoning = false;
  let toolNames: string[] = [];

  const flush = (): void => {
    if (run.length === 0 || runFirstOrder === undefined) {
      return;
    }
    items.push({
      kind: 'run',
      run: {
        messages: run,
        firstOrder: runFirstOrder,
        hasReasoning,
        summary: buildSummary(hasReasoning, toolNames),
      },
    });
    run = [];
    runFirstOrder = undefined;
    hasReasoning = false;
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
      hasReasoning = true;
    } else {
      toolNames.push(toolNameFor(message));
    }
  }
  flush();
  return items;
}

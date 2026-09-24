import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UnifiedMessage } from '@/types/conversation';
import type { ActivityRun } from './activityGrouping';
import type { ToolCardView } from './toolLinking';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolBlock } from './ToolBlock';
import messageStyles from './ClaudeMessage.module.css';
import styles from './ActivityGroup.module.css';

interface ActivityGroupProps {
  readonly run: ActivityRun;
  /** Paired tool views from `toolLinking.ts`, keyed by the message's `order`. */
  readonly toolCards: ReadonlyMap<number, ToolCardView>;
}

/**
 * One activity run rendered as claude.ai's unified toggle
 * (`09c-claude-unified-activity-toggle.md`): a single `<details>` whose
 * collapsed summary lists the run's tools («تفکر» first when reasoning is
 * present) and whose body shows every member in occurrence order — thinking
 * block first, then each tool step — as rows on one shared surface, never as
 * a stack of separately-collapsible cards (FR5).
 *
 * The toggle is deliberately a native `<details>`: keyboard-accessible
 * collapse like the standalone tool card, collapsed by default so a long tool
 * trail never pushes the conversation off-screen.
 */
export function ActivityGroup({ run, toolCards }: ActivityGroupProps): JSX.Element {
  return (
    <div
      className={`${messageStyles.row} ${messageStyles.assistantRow}`}
      data-role="assistant"
      data-kind="activity_group"
    >
      <details className={styles.group} data-activity-group="true">
        <summary className={styles.summary}>
          <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
          {run.summary}
        </summary>
        <div className={styles.body}>
          {run.messages.map((message) => renderMember(message, toolCards))}
        </div>
      </details>
    </div>
  );
}

/** One member: the reasoning block or one tool step, embedded (no own toggle). */
function renderMember(
  message: UnifiedMessage,
  toolCards: ReadonlyMap<number, ToolCardView>,
): JSX.Element | null {
  if (message.kind === 'text') {
    // Every `text` member is a thinking fragment by construction
    // (`groupActivityRuns`); the label stays the theme's muted reasoning line.
    return <ThinkingBlock key={message.order} content={message.content ?? ''} embedded />;
  }
  if (message.kind === 'tool_activity') {
    const card = toolCards.get(message.order);
    // Same guard as ClaudeMessage: a malformed record renders nothing, never
    // crashes (ADR #6).
    return card === undefined ? null : <ToolBlock key={message.order} card={card} embedded />;
  }
  return null;
}

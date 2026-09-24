import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ActivityRun } from './activityGrouping';
import { ChatGPTMessage } from './ChatGPTMessage';
import styles from './ActivityGroup.module.css';

interface ActivityGroupProps {
  readonly run: ActivityRun;
}

/**
 * Renders one assistant reasoning/tool run as a single collapsible `<details>`
 * (11b FR-4 / ADR-K). The ChatGPT counterpart to Claude's `ActivityGroup`;
 * themes never import across folders. The group is the ONLY toggle in a
 * reasoning/tool cluster — its members render open by default so reasoning text
 * is immediately readable (reasoning is content, not chrome). A one-message run
 * still collapses (the spec's "still a group" rule), so standalone reasoning
 * stays tucked behind the summary until expanded. The summary is built by
 * `groupActivityRuns`: `تفکر` first when reasoning is present, tool names
 * comma-joined (no invented names).
 */
export function ActivityGroup({ run }: ActivityGroupProps): JSX.Element {
  return (
    <details
      className={styles.group}
      data-activity-group="true"
      data-has-reasoning={run.hasReasoning ? 'true' : 'false'}
      open
    >
      <summary className={styles.summary} data-group-summary="true">
        <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
        <span className={styles.summaryText} data-group-summary-text="true">
          {run.summary}
        </span>
      </summary>
      <div className={styles.body} data-group-body="true">
        {run.messages.map((message) => (
          <ChatGPTMessage key={message.order} message={message} />
        ))}
      </div>
    </details>
  );
}

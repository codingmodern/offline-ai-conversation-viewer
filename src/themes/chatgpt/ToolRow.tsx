import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import type { UnifiedToolActivity } from '@/types/conversation';
import styles from './ToolRow.module.css';

interface ToolRowProps {
  readonly activity: UnifiedToolActivity;
}

/**
 * One ChatGPT tool/Search step rendered as a static row inside the unified
 * activity group (11b FR‑5 / ADR‑K). This is the copy‑and‑restyle of Claude's
 * `ToolBlock` *without* its `tool_use`/`tool_result` id‑pairing and without the
 * error badge: 11a emits no `toolUseId` and no `toolIsError`, so neither prop
 * exists on `UnifiedToolActivity` for ChatGPT.
 *
 * ChatGPT data is always unpaired (one row = one step), and every tool
 * message lives inside a `<details>` group, so this row has no toggle of its
 * own — it is a plain header + optional input + optional output, shown only
 * when each payload actually exists. Payloads are raw (JSON or extracted text),
 * never interpreted or executed (Unit 06 FR6: visual‑only).
 */
const MAX_PAYLOAD_CHARS = 20000;
const MAX_OUTPUT_CHARS = 4000;

export function ToolRow({ activity }: ToolRowProps): JSX.Element {
  const { t } = useTranslation();
  const name = activity.toolName ?? t('themes.toolFallback');
  const hasInput = activity.toolInput !== undefined;
  const hasOutput = activity.toolOutput !== undefined;

  return (
    <div className={styles.row} data-tool-row="true" data-activity-type={activity.activityType}>
      <div className={styles.header}>
        <Wrench size={14} aria-hidden="true" className={styles.icon} />
        <span className={styles.name}>{name}</span>
      </div>
      {hasInput && (
        <div className={styles.section}>
          <span className={styles.caption}>{t('themes.toolInput')}</span>
          <pre className={styles.payload}>{truncate(formatJson(activity.toolInput), MAX_PAYLOAD_CHARS)}</pre>
        </div>
      )}
      {hasOutput && (
        <div className={styles.section}>
          <span className={styles.caption}>{t('themes.toolOutput')}</span>
          <pre className={styles.payload}>{truncate(describeToolOutput(activity.toolOutput), MAX_OUTPUT_CHARS)}</pre>
        </div>
      )}
    </div>
  );
}

/** JSON view of an arbitrary payload; a stringify failure degrades to `String`. */
function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Flattens a tool result for display: text blocks joined; any other shape
 * shown as raw JSON instead of being guessed at (`ai-workflow-rules.md` §3).
 */
function describeToolOutput(output: unknown): string {
  if (output === undefined || output === null) {
    return '';
  }
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const block of output) {
      if (
        typeof block === 'object' &&
        block !== null &&
        'text' in block &&
        typeof (block as { text: unknown }).text === 'string'
      ) {
        texts.push((block as { text: string }).text);
      }
    }
    if (texts.length > 0) {
      return texts.join('\n');
    }
  }
  return formatJson(output);
}

/** Appends an ellipsis marker when the payload exceeded its cap. */
function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}

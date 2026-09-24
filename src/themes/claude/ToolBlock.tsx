import type { JSX } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import type { ToolCardView } from './toolLinking';
import styles from './ToolBlock.module.css';

interface ToolBlockProps {
  readonly card: ToolCardView;
  /**
   * Embedded mode (spec 09c): inside the unified activity group the group's
   * own `<details>` is the single toggle, so each tool step renders as a
   * plain row — static header (icon + name + «خطا» badge, no chevron) with
   * its input/output sections always visible.
   */
  readonly embedded?: boolean;
}

/** Hard caps so a huge tool payload can never flood the conversation region. */
const MAX_PAYLOAD_CHARS = 20000;
const MAX_OUTPUT_CHARS = 4000;

/**
 * One Claude tool step, rendered as a single collapsible card
 * (`ui-context.md` §4.4 → Tool Cards).
 *
 * The card is Claude's own UI pattern: a compact header row (icon + the tool's
 * verbatim name, e.g. `web_search`) that expands to the verbatim `input` and
 * the linked result's output. Payloads are shown as **raw JSON / extracted
 * text** — never interpreted, never executed (Unit 06's visual-only rule,
 * carried over to this theme).
 *
 * The card is a native `<details>` element: keyboard-accessible collapsing for
 * free, and it stays collapsed by default so a long tool trail never pushes
 * the actual conversation off-screen.
 */
export function ToolBlock({ card, embedded = false }: ToolBlockProps): JSX.Element {
  if (embedded) {
    return (
      <div
        className={styles.cardEmbedded}
        data-tool-state={card.isError === true ? 'error' : 'ok'}
      >
        <div className={`${styles.summary} ${styles.summaryEmbedded}`}>
          <Wrench size={14} aria-hidden="true" className={styles.icon} />
          <span className={styles.name}>{card.toolName ?? 'ابزار'}</span>
          {card.isError === true && (
            <span className={styles.errorBadge}>خطا</span>
          )}
        </div>
        <div className={styles.body}>
          {card.input !== undefined && (
            <div className={styles.section}>
              <span className={styles.caption}>ورودی</span>
              <pre className={styles.payload}>
                {truncate(formatJson(card.input), MAX_PAYLOAD_CHARS)}
              </pre>
            </div>
          )}
          {card.hasResult && (
            <div className={styles.section}>
              <span className={styles.caption}>خروجی</span>
              <pre className={styles.payload}>
                {truncate(describeToolOutput(card.output), MAX_OUTPUT_CHARS)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <details
      className={styles.card}
      data-tool-state={card.isError === true ? 'error' : 'ok'}
    >
      <summary className={styles.summary}>
        <Wrench size={14} aria-hidden="true" className={styles.icon} />
        <span className={styles.name}>{card.toolName ?? 'ابزار'}</span>
        {card.isError === true && (
          <span className={styles.errorBadge}>خطا</span>
        )}
        <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
      </summary>
      <div className={styles.body}>
        {card.input !== undefined && (
          <div className={styles.section}>
            <span className={styles.caption}>ورودی</span>
            <pre className={styles.payload}>
              {truncate(formatJson(card.input), MAX_PAYLOAD_CHARS)}
            </pre>
          </div>
        )}
        {card.hasResult && (
          <div className={styles.section}>
            <span className={styles.caption}>خروجی</span>
            <pre className={styles.payload}>
              {truncate(describeToolOutput(card.output), MAX_OUTPUT_CHARS)}
            </pre>
          </div>
        )}
      </div>
    </details>
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
 * Flattens a `tool_result`'s verbatim `content` for display.
 *
 * The export stores an array of typed blocks (`{type:'text', text}` attested),
 * so text blocks are joined; any other shape is shown as raw JSON instead of
 * being guessed at (`ai-workflow-rules.md` §3 — never invent product behaviour).
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

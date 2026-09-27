import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ReasoningBlock.module.css';

interface ReasoningBlockProps {
  /**
   * The verbatim reasoning body (11a already flattened `thoughts` into lines
   * for us — see `readThoughts` in `normalization/chatgpt.ts`).
   */
  readonly content: string;
}

/**
 * ChatGPT's reasoning, rendered as a static muted block *inside* the unified
 * activity group (11b FR‑4 / ADR‑K). This is the embedded half of Claude's
 * `ThinkingBlock`: because `groupActivityRuns` puts every reasoning message in
 * a run, a standalone collapsible variant is dead code here, so it is omitted
 * (11b FR‑1 minimalism — no speculative work).
 *
 * The header is the quiet muted line the spec allows; it never says
 * «Thought for N seconds» (no duration lives in the data — FR‑4 forbids
 * fabrication, ADR‑18). When the export supplies a `reasoning_recap` summary it
 * reaches here as the message's own content.
 */
export function ReasoningBlock({ content }: ReasoningBlockProps): JSX.Element {
  const { t } = useTranslation();
  const steps = content.split('\n').filter((line) => line.trim() !== '');

    return (
    <section className={styles.thinking} data-thinking="embedded">
      <span className={styles.header}>{t('themes.thinkingHeader')}</span>
      {steps.length > 0 && (
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={index} className={styles.step}>
              {step}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

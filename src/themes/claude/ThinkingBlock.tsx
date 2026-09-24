import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './ThinkingBlock.module.css';

interface ThinkingBlockProps {
  /**
   * The verbatim body for visible reasoning, or the platform's own one-line
   * summary for a hidden one (normalization substitutes it). Each non-empty
   * line becomes one step.
   */
  readonly content: string;
  /**
   * Embedded mode (spec 09c): inside the unified activity group the group's
   * own `<details>` is the single toggle, so reasoning renders as a static
   * labelled block — no own header button, steps always visible.
   */
  readonly embedded?: boolean;
}

/**
 * Claude's collapsible reasoning section (`ui-context.md` §4.4).
 *
 * Like the real UI, the block is a quiet muted-coloured header over dimmed
 * steps, collapsed by default — a viewer gains nothing from expanding reasoning
 * the user hasn't asked for. 09b row 3 keeps the accent off message elements
 * (branding only), so the header reads in --claude-text-muted, not orange.
 *
 * The header reads «فرآیند تفکر» because the unified model carries no thinking
 * duration — fabricating "Thought for N seconds" without a source would invent
 * data. A hidden fragment's content is the export's own summary line, so
 * expanding it shows exactly what the platform chose to surface — nothing more
 * is available to reveal.
 *
 * Structure mirrors the DeepSeek theme's `ThinkingBlock` deliberately
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders).
 */
export function ThinkingBlock({ content, embedded = false }: ThinkingBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const steps = content.split('\n').filter((line) => line.trim() !== '');

  if (embedded) {
    return (
      <section className={styles.thinking} data-thinking="embedded">
        <span className={styles.embeddedHeader}>فرآیند تفکر</span>
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

  return (
    <section
      className={styles.thinking}
      data-thinking={expanded ? 'expanded' : 'collapsed'}
    >
      <button
        type="button"
        className={styles.header}
        aria-expanded={expanded}
        onClick={(): void => {
          setExpanded((value) => !value);
        }}
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={expanded ? styles.chevronOpen : styles.chevron}
        />
        فرآیند تفکر
      </button>
      {expanded && steps.length > 0 && (
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

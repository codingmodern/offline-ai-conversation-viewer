import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './ThinkingBlock.module.css';

interface ThinkingBlockProps {
  /** The THINK fragment's verbatim text; each non-empty line becomes one step. */
  readonly content: string;
}

/**
 * DeepSeek's collapsible reasoning section (`ui-context.md` §4.6, ADR #17).
 *
 * Per the corrected spec there is deliberately **no background box** — not even
 * when expanded: the steps render directly on the base background, dimmed via
 * `--deepseek-thinking-text` and structured as a numbered list, exactly as in
 * the real UI. The accent-coloured header is the only affordance.
 *
 * Collapsed by default. `architecture.md` documents that default for mobile;
 * it is applied generally here because a viewer gains nothing from expanding
 * reasoning the user hasn't asked for, and the real UI starts collapsed too.
 *
 * The header reads «فرآیند تفکر» because the unified model carries no thinking
 * duration — fabricating "Thought for N seconds" without a source would invent
 * data (approved decision D2).
 */
export function ThinkingBlock({ content }: ThinkingBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const steps = content.split('\n').filter((line) => line.trim() !== '');

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

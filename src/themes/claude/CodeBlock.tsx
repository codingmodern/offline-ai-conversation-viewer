import type { JSX } from 'react';
import type { CodeSegment } from './codeFences';
import { CopyButton } from './CopyButton';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  readonly segment: CodeSegment;
}

/**
 * Claude's code block (`ui-context.md` §4.4 → Code Blocks): its own dark
 * charcoal background in both modes, a language label and a Copy button — and
 * nothing else. Visual-only: the code is never executed, highlighted beyond
 * plain monospace, or made interactive.
 *
 * A deliberate duplicate of the DeepSeek theme's `CodeBlock`
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders),
 * re-tokened onto `--claude-*`.
 */
export function CodeBlock({ segment }: CodeBlockProps): JSX.Element {
  return (
    <figure
      className={styles.block}
      data-code-block="true"
      data-language={segment.language ?? 'text'}
    >
      <figcaption className={styles.bar}>
        <span className={styles.language}>{segment.language ?? 'کد'}</span>
        <CopyButton text={segment.value} label="کپی کد" />
      </figcaption>
      <pre className={styles.pre}>
        <code className={styles.code}>{segment.value}</code>
      </pre>
    </figure>
  );
}

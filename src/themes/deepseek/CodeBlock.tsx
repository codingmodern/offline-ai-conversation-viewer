import type { JSX } from 'react';
import type { CodeSegment } from './codeFences';
import { CopyButton } from './CopyButton';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  readonly segment: CodeSegment;
}

/**
 * DeepSeek's code block (`ui-context.md` §4.6 → Code Blocks): its own dark
 * background in both modes, a language label and a Copy button — and nothing
 * else. FR6 is explicitly visual-only: the code is never executed, highlighted
 * beyond plain monospace, or made interactive.
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

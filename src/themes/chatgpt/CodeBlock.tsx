import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeSegment } from './codeFences';
import { CopyButton } from './CopyButton';
import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  readonly segment: CodeSegment;
}

/**
 * ChatGPT's code block (11b FR‑3). A copy‑and‑restyle of Claude's `CodeBlock`
 * onto the `--chatgpt-*` tokens — themes never import across theme folders. Dark
 * charcoal background in both modes (§4.3), a language label and a Copy button,
 * and nothing else. Visual only — the code is never executed or highlighted.
 */
export function CodeBlock({ segment }: CodeBlockProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <figure
      className={styles.block}
      data-code-block="true"
      data-language={segment.language ?? 'text'}
    >
      <figcaption className={styles.bar}>
        <span className={styles.language}>{segment.language ?? t('themes.codeLabel')}</span>
        <CopyButton text={segment.value} label={t('themes.copyCode')} />
      </figcaption>
      <pre className={styles.pre}>
        <code className={styles.code}>{segment.value}</code>
      </pre>
    </figure>
  );
}

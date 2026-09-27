import { useState } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import styles from './CopyButton.module.css';

interface CopyButtonProps {
  /** Text copied verbatim — never trimmed or re-formatted. */
  readonly text: string;
  /** Persian accessible name announced to screen readers. */
  readonly label: string;
}

/**
 * The only message‑level action ChatGPT's spec keeps (11b FR‑8 / ADR‑L). A
 * copy‑and‑restyle of Claude's `CopyButton` onto `--chatgpt-*` — themes never
 * import across theme folders. Copying is presentation convenience, not
 * interactivity: it duplicates text the user already sees and never mutates
 * app state. A missing clipboard API degrades to a no‑op — never a crash.
 */
export function CopyButton({ text, label }: CopyButtonProps): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      return;
    }
    void clipboard.writeText(text).then(
      (): void => {
        setCopied(true);
        window.setTimeout((): void => {
          setCopied(false);
        }, 1500);
      },
      (): void => undefined,
    );
  };

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleCopy}
      aria-label={copied ? t('themes.copied') : label}
    >
      {copied ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
    </button>
  );
}

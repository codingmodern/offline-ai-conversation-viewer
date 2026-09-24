import { useState } from 'react';
import type { JSX } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './CopyButton.module.css';

interface CopyButtonProps {
  /** Text copied verbatim — never trimmed or re-formatted. */
  readonly text: string;
  /** Persian accessible name announced to screen readers. */
  readonly label: string;
}

/**
 * The only message-level action Gemini's spec keeps active in this project
 * (`ui-context.md` §4.5 → Message Actions: Copy, Regenerate, Like/Dislike and
 * Share are named, but only Copy is in scope).
 *
 * A deliberate duplicate of the Claude/DeepSeek themes' `CopyButton`
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders), so
 * the copied state behaves pixel-for-pixel the same on every platform.
 * Copying is presentation-layer convenience, not message interactivity: it
 * duplicates content the user already sees and never mutates app state. A
 * missing clipboard API (old browsers, some webviews) degrades to a no-op — a
 * copy button must never be able to crash the renderer.
 */
export function CopyButton({ text, label }: CopyButtonProps): JSX.Element {
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
      // Rejection (e.g. permission denied) is silently ignored: the button is
      // a convenience, and raw failures have no user-facing meaning here.
      (): void => undefined,
    );
  };

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleCopy}
      aria-label={copied ? 'کپی شد' : label}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
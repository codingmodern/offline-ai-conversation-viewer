import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedConversation } from '@/types/conversation';
import { GeminiMessage } from './GeminiMessage';
import styles from './GeminiConversationView.module.css';
// Tokens are global custom properties owned by this theme; importing them here
// keeps the theme self-contained — mounting it is the only thing the shell does.
import './tokens.css';

interface GeminiConversationViewProps {
  readonly conversation: UnifiedConversation;
}

/**
 * Gemini's conversation surface — the theme module the shell hands the stage
 * (`ui-context.md` §4.5). Everything visual comes from `./tokens.css` via CSS
 * custom properties; no Gemini value is hardcoded in any component, so the
 * three themes stay interchangeable without touching this folder (FR5/NFR3).
 *
 * The view is deliberately the thinnest of the three: Gemini's export carries
 * no tool activity and no reasoning blocks to fold into groups, so a turn is
 * just the messages `normalization/gemini.ts` produced, in the order it
 * produced them. That order is already ascending by `time` (FR3/AC2) — the view
 * renders array order and never re-sorts, because re-ordering here would hide a
 * parser regression instead of failing a test.
 *
 * An empty conversation is a valid state, not an error (Unit 03's rule): the
 * themed surface renders with an explanatory line instead of messages.
 */
export function GeminiConversationView({
  conversation,
}: GeminiConversationViewProps): JSX.Element {
  const { t } = useTranslation();
  const { messages } = conversation;

  return (
    <div className={styles.view} data-provider-theme="gemini">
      <div className={styles.column}>
        {messages.length === 0 ? (
          <p className={styles.empty}>{t('themes.emptyConversation')}</p>
        ) : (
          <ol className={styles.messages}>
            {messages.map((message) => (
              <li key={message.order} className={styles.messageItem}>
                <GeminiMessage message={message} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
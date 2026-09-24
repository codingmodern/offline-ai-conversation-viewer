import type { JSX } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import { DeepSeekMessage } from './DeepSeekMessage';
import styles from './DeepSeekConversationView.module.css';
// Tokens are global custom properties owned by this theme; importing them here
// keeps the theme self-contained — mounting it is the only thing the shell does.
import './tokens.css';

interface DeepSeekConversationViewProps {
  readonly conversation: UnifiedConversation;
}

/**
 * DeepSeek's conversation surface — the theme module Unit 06 hands the shell
 * (`ui-context.md` §4.6). Everything visual comes from `./tokens.css` via CSS
 * custom properties; no DeepSeek value is hardcoded in any component, so a
 * second theme can be added later without touching this folder (FR5/NFR3).
 *
 * An empty conversation is a valid state, not an error (spec → Edge Cases):
 * the themed surface renders with an explanatory line instead of messages.
 */
export function DeepSeekConversationView({
  conversation,
}: DeepSeekConversationViewProps): JSX.Element {
  return (
    <div className={styles.view} data-provider-theme="deepseek">
      <div className={styles.column}>
        {conversation.messages.length === 0 ? (
          <p className={styles.empty}>پیامی برای نمایش در این گفتگو نیست.</p>
        ) : (
          <ol className={styles.messages}>
            {conversation.messages.map((message) => (
              <li key={message.order} className={styles.messageItem}>
                <DeepSeekMessage message={message} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

import type { JSX } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import { ClaudeMessage } from './ClaudeMessage';
import { ActivityGroup } from './ActivityGroup';
import { groupActivityRuns } from './activityGrouping';
import { linkToolActivity } from './toolLinking';
import styles from './ClaudeConversationView.module.css';
// Tokens are global custom properties owned by this theme; importing them here
// keeps the theme self-contained — mounting it is the only thing the shell does.
import './tokens.css';

interface ClaudeConversationViewProps {
  readonly conversation: UnifiedConversation;
}

/**
 * Claude's conversation surface — the theme module the shell hands the stage
 * (`ui-context.md` §4.4). Everything visual comes from `./tokens.css` via CSS
 * custom properties; no Claude value is hardcoded in any component, so another
 * theme can be added later without touching this folder (FR5/NFR3).
 *
 * Before rendering, `linkToolActivity` pairs every `tool_use` invocation with
 * its `tool_result` so each tool step shows as one collapsible card with its
 * output inside — the merge is display-only and never drops messages. Then
 * `groupActivityRuns` folds each contiguous run of thinking/tool traffic
 * between two text segments into the single `<details>` toggle the real
 * claude.ai shows (spec 09c) — text segments between runs stay outside the
 * toggle, and messages without any background activity render no toggle.
 *
 * An empty conversation is a valid state, not an error (spec → Edge Cases):
 * the themed surface renders with an explanatory line instead of messages.
 */
export function ClaudeConversationView({
  conversation,
}: ClaudeConversationViewProps): JSX.Element {
  const { cards, mergedOrders } = linkToolActivity(conversation.messages);

  const visibleMessages = conversation.messages.filter(
    (message) => !mergedOrders.has(message.order),
  );

  const sequence = groupActivityRuns(visibleMessages, cards);

  return (
    <div className={styles.view} data-provider-theme="claude">
      <div className={styles.column}>
        {sequence.length === 0 ? (
          <p className={styles.empty}>پیامی برای نمایش در این گفتگو نیست.</p>
        ) : (
          <ol className={styles.messages}>
            {sequence.map((item) =>
              item.kind === 'run' ? (
                <li key={item.run.firstOrder} className={styles.messageItem}>
                  <ActivityGroup run={item.run} toolCards={cards} />
                </li>
              ) : (
                <li key={item.message.order} className={styles.messageItem}>
                  <ClaudeMessage message={item.message} toolCards={cards} />
                </li>
              ),
            )}
          </ol>
        )}
      </div>
    </div>
  );
}

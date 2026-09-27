import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedConversation } from '@/types/conversation';
import { activeDateLocale } from '@/i18n';
import { ChatGPTMessage } from './ChatGPTMessage';
import { ActivityGroup } from './ActivityGroup';
import { groupActivityRuns } from './activityGrouping';
import styles from './ChatGPTConversationView.module.css';
// Tokens are global custom properties owned by this theme; importing them here
// keeps the theme self-contained — mounting it is the only thing the shell does.
import './tokens.css';

interface ChatGPTConversationViewProps {
  readonly conversation: UnifiedConversation;
}

/**
 * ChatGPT's conversation surface (11b). The theme module the shell hands the
 * stage (§4.3). All colour comes from `./tokens.css` via CSS custom properties;
 * no ChatGPT value is hardcoded in a component, so the theme is self-contained.
 *
 * 11a emits no `toolUseId`, so `linkToolActivity` and a `cards` map do not
 * exist for this theme — every message reaches the screen as‑is, and
 * `groupActivityRuns` (its own copy of Claude's) folds each contiguous run of
 * reasoning/tool traffic into the single `<details>` toggle the real UI shows.
 * Text segments between runs stay outside the toggle; messages with no
 * background activity render no toggle. An empty conversation is a valid
 * state, not an error — an explanatory line renders (§4.4 Edge Cases).
 *
 * A centered Thread Date Line (`§4.3` 11b‑0) appears once, above the messages,
 * sourced from `createdAt` then the first message, formatted in the active UI
 * locale (never a raw ISO string).
 */
export function ChatGPTConversationView({
  conversation,
}: ChatGPTConversationViewProps): JSX.Element {
  const { t } = useTranslation();
  const messages = conversation.messages ?? [];
  const sequence = groupActivityRuns(messages);
  const threadDate = formatThreadDate(conversation.createdAt, messages);

  return (
    <div className={styles.view} data-provider-theme="chatgpt">
      <div className={styles.column}>
        <ThreadDateLine date={threadDate} />
        {sequence.length === 0 ? (
          <p className={styles.empty} data-empty="true">
            {t('themes.emptyConversation')}
          </p>
        ) : (
          <ol className={styles.messages}>
            {sequence.map((item) =>
              item.kind === 'run' ? (
                <li key={item.run.firstOrder} className={styles.messageItem}>
                  <ActivityGroup run={item.run} />
                </li>
              ) : (
                <li key={item.message.order} className={styles.messageItem}>
                  <ChatGPTMessage message={item.message} />
                </li>
              ),
            )}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Thread Date Line: `createdAt` -> first message -> none, in the active locale. */
function formatThreadDate(createdAt: string | undefined, messages: readonly { createdAt?: string }[]):
  string | undefined {
  const source =
    createdAt ??
    messages[0]?.createdAt;
  if (source === undefined) {
    return undefined;
  }
  const parsedMs = Date.parse(source);
  return Number.isNaN(parsedMs)
    ? undefined
    : new Intl.DateTimeFormat(activeDateLocale(), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parsedMs);
}

function ThreadDateLine({ date }: { readonly date: string | undefined }): JSX.Element | null {
  if (date === undefined) {
    return null;
  }
  return (
    <p className={styles.threadDate} data-thread-date="true">
      {date}
    </p>
  );
}

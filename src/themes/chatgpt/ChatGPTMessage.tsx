import { useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { UnifiedMessage } from '@/types/conversation';
import { splitCodeFences } from './codeFences';
import { AttachmentCard } from './AttachmentCard';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolRow } from './ToolRow';
import { renderMarkdown } from './markdown';
import { REASONING_FRAGMENT_TYPES } from './activityGrouping';
import styles from './ChatGPTMessage.module.css';

interface ChatGPTMessageProps {
  readonly message: UnifiedMessage;
}

export function ChatGPTMessage({ message }: ChatGPTMessageProps): JSX.Element {
  if (message.kind === 'attachment') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="attachment">
        <AttachmentCard attachments={message.attachments ?? []} />
      </div>
    );
  }

  if (message.kind === 'tool_activity') {
    const activity = message.toolActivity;
    return (
      <div className={styles.row} data-role={message.role} data-kind="tool_activity">
        {activity === undefined ? null : <ToolRow activity={activity} />}
      </div>
    );
  }

  const content = message.content ?? '';
  const fragmentType = message.sourceFragmentType;

  if (REASONING_FRAGMENT_TYPES.has(fragmentType)) {
    return (
      <div
        className={`${styles.row} ${styles.assistantRow}`}
        data-role={message.role}
        data-kind="text"
        data-fragment={fragmentType}
      >
        <ReasoningBlock content={content} />
      </div>
    );
  }

  if (content === '' && !isKnownTextFragment(fragmentType)) {
    const rowClass = isAssistant(message.role)
      ? `${styles.row} ${styles.assistantRow}`
      : styles.row;
    return (
      <div
        className={rowClass}
        data-role={message.role}
        data-kind="text"
        data-fragment={fragmentType}
        data-unsupported-type={fragmentType}
      >
        <span className={styles.unsupported}>
          محتوای پشتیبانی‌نشده: <code>{fragmentType}</code>
        </span>
      </div>
    );
  }
    if (message.role === 'user') {
    return (
      <div className={`${styles.row} ${styles.userRow}`} data-role="user" data-kind="text">
        <div className={styles.userMessage}>
          <ChatGPTUserBubble content={content} />
          <div className={styles.actions}>
            <CopyButton text={content} label="کپی پیام" />
          </div>
        </div>
      </div>
    );
  }

  const isKnownRole = isAssistant(message.role);
  const segments = splitCodeFences(content);
  const actionDate = isKnownRole ? formatActionDate(message.createdAt) : undefined;

  return (
    <div
      className={`${styles.row} ${isKnownRole ? styles.assistantRow : styles.unknownRole}`}
      data-role={message.role}
      data-kind="text"
      data-fragment={fragmentType}
    >
            {isKnownRole ? null : <span className={styles.unknownBadge}>پیام با نقش ناشناخته</span>}
      <div className={styles.assistantBody}>
        {segments.map((segment, index) =>
          segment.type === 'code' ? (
            <CodeBlock key={index} segment={segment} />
          ) : (
            <div
              key={index}
              className={styles.assistantText}
              data-markdown="true"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(segment.value) }}
            />
          ),
        )}
      </div>
      {isKnownRole && (
        <div className={styles.actions}>
          <CopyButton text={content} label="کپی پاسخ" />
          {actionDate === undefined ? null : (
            <span className={styles.actionDate} data-action-date="true">
              {actionDate}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function isAssistant(role: string): boolean {
  return role === 'assistant';
}

function isKnownTextFragment(fragmentType: string): boolean {
  return fragmentType === 'text' || fragmentType === 'multimodal_text';
}

/** Per-message timestamp, only from the export (FR-7); undefined => no date. */
function formatActionDate(createdAt: string | undefined): string | undefined {
  if (createdAt === undefined) {
    return undefined;
  }
  const parsedMs = Date.parse(createdAt);
  return Number.isNaN(parsedMs)
    ? undefined
    : new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(parsedMs);
}

/** 6-line collapsible user bubble (11b FR-3, reused behaviour). */
function ChatGPTUserBubble({ content }: { readonly content: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [measured, setMeasured] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const collapsed = !expanded && (!measured || overflowing);

  useLayoutEffect(() => {
    if (expanded) {
      return;
    }
    const node = bubbleRef.current;
    if (node === null) {
      return;
    }
    const measure = (): void => {
      const doesOverflow = node.scrollHeight - node.clientHeight > 1;
      setOverflowing((previous) => (previous === doesOverflow ? previous : doesOverflow));
      setMeasured((previous) => (previous ? previous : true));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return (): void => {
      observer.disconnect();
    };
  }, [content, expanded]);

  return (
    <>
      <div
        className={
          collapsed
            ? `${styles.userBubbleWrapper} ${styles.userBubbleWrapperCollapsed}`
            : styles.userBubbleWrapper
        }
      >
        <div
          ref={bubbleRef}
          className={
            collapsed ? `${styles.userBubble} ${styles.userBubbleCollapsed}` : styles.userBubble
          }
        >
          {content}
        </div>
      </div>
      {overflowing && (
        <button
          type="button"
          className={styles.expandButton}
          aria-expanded={expanded}
          onClick={(): void => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? 'نمایش کمتر' : 'نمایش بیشتر'}
        </button>
      )}
    </>
  );
}
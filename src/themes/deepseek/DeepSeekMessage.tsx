import { useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { UnifiedMessage } from '@/types/conversation';
import { splitCodeFences } from './codeFences';
import { AttachmentCard } from './AttachmentCard';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolActivityRow } from './ToolActivityRow';
import { renderMarkdown } from './markdown';
import styles from './DeepSeekMessage.module.css';

interface DeepSeekMessageProps {
  readonly message: UnifiedMessage;
}

/**
 * Maps one `UnifiedMessage` onto DeepSeek's visual pattern
 * (`ui-context.md` §4.6), dispatching on the Unit 03 `kind` discriminator and
 * `sourceFragmentType` (ADR #7):
 *
 *   attachment            → file cards (name + size, no preview — no bytes exist)
 *   tool_activity         → decorative icon+label row (approved decision D1)
 *   text / THINK          → collapsible «فرآیند تفکر» block (ADR #17)
 *   text / user           → bubble on the physical right — the standard
 *                           AI-chat convention, shared by both themes of this
 *                           RTL-locked app (see the module CSS note)
 *   text / assistant      → full-width column stack (the old flush-left
 *                           anchor is gone - see the module CSS note), no
 *                           bubble, with the one active action
 *                           (Copy) plus fenced code rendered as code blocks
 *   text / unknown role   → simplified muted rendering — never a crash
 *                           (Unit 03's unknown-fragment edge case)
 *
 * Payload fields are optional on `UnifiedMessage` (ADR #6), so every accessor
 * here has an empty fallback: a malformed message degrades, it never throws.
 */
export function DeepSeekMessage({ message }: DeepSeekMessageProps): JSX.Element {
  if (message.kind === 'attachment') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="attachment">
        <AttachmentCard attachments={message.attachments ?? []} />
      </div>
    );
  }

  if (message.kind === 'tool_activity') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="tool_activity">
        {message.toolActivity === undefined ? null : (
          <ToolActivityRow activity={message.toolActivity} />
        )}
      </div>
    );
  }

  // `kind === 'text'` is the only remaining kind.
  const content = message.content ?? '';

  if (message.sourceFragmentType === 'THINK') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="text" data-fragment="THINK">
        <ThinkingBlock content={content} />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className={`${styles.row} ${styles.userRow}`} data-role="user" data-kind="text">
        {/* Verbatim text in the bubble; DeepSeek keeps user messages plain.
            The Copy affordance mirrors the assistant action row: same
            `CopyButton` component, same styling, copied state identical
            (post-Unit-06 refinement, ADR #20). */}
        <div className={styles.userMessage}>
          <DeepSeekUserBubble content={content} />
          <div className={styles.actions}>
            <CopyButton text={content} label="کپی پیام" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant — and, as a simplification, any unrecognised role: no bubble.
  // Known assistant rows are a full-width column stack (`.assistantRow`,
  // the old flush-left anchor is gone - see the module CSS note); unknown roles keep the
  // plain full-width block, lose the action row, and are dimmed — the
  // spec's allowed "simple or generic appearance" for unusual messages
  // (06-multi-theme-rendering.md → Edge Cases).
  const isKnownRole = message.role === 'assistant';
  const segments = splitCodeFences(content);

  return (
    <div
      className={`${styles.row} ${isKnownRole ? styles.assistantRow : styles.unknownRole}`}
      data-role={message.role}
      data-kind="text"
    >
      {isKnownRole ? null : <span className={styles.unknownBadge}>پیام با نقش ناشناخته</span>}
      <div className={styles.assistantBody}>
        {segments.map((segment, index) =>
          segment.type === 'code' ? (
            <CodeBlock key={index} segment={segment} />
          ) : (
            // Markdown pipeline (post-Unit-06 refinement, ADR #20):
            //   marked → DOMPurify → dangerouslySetInnerHTML.
            // marked emits its own block tags, so the wrapper is a div, not a
            // p (nested <p> would be invalid HTML). The copy button below
            // still copies the raw `content` verbatim, untouched.
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
        </div>
      )}
    </div>
  );
}

/**
 * Unit 09d — collapsible user bubble (claude.ai parity).
 *
 * Deliberate mirror of the Claude theme's `ClaudeUserBubble`
 * (`ai-workflow-rules.md` §12 — themes never import across theme folders).
 * Local per-message `expanded` state (FR6); overflow detection is purely
 * geometric (`scrollHeight > clientHeight` measured in the collapsed state),
 * so wrapped line boxes — not raw `\n` counts — decide, RTL/LTR and FA/EN
 * independent.
 */
function DeepSeekUserBubble({ content }: { readonly content: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [measured, setMeasured] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Start clamped so a long message never flashes full-height for one paint;
  // the clamp lifts after measurement proves the content fits (Validation:
  // short messages end with no clamp classes at all).
  const collapsed = !expanded && (!measured || overflowing);

  useLayoutEffect(() => {
    // While expanded the bubble is intentionally full-height; re-clamping to
    // measure would flash. The stored `overflowing` flag (re-measured on
    // collapse via the `expanded` dep) still drives the «show less» button.
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

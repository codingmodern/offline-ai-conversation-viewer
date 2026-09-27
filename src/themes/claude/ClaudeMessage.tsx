import { useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedMessage } from '@/types/conversation';
import { activeDateLocale } from '@/i18n';
import { splitCodeFences } from './codeFences';
import type { ToolCardView } from './toolLinking';
import { AttachmentCard } from './AttachmentCard';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolBlock } from './ToolBlock';
import { renderMarkdown } from './markdown';
import styles from './ClaudeMessage.module.css';

interface ClaudeMessageProps {
  readonly message: UnifiedMessage;
  /** Paired tool views from `toolLinking.ts`, keyed by the message's `order`. */
  readonly toolCards: ReadonlyMap<number, ToolCardView>;
}

/**
 * Maps one `UnifiedMessage` onto Claude's visual pattern
 * (`ui-context.md` §4.4), dispatching on the Unit 03 `kind` discriminator and
 * `sourceFragmentType`:
 *
 *   attachment            → file cards (name only — the export has no size)
 *   tool_activity         → collapsible tool card (input + paired output)
 *   text / thinking       → collapsible «فرآیند تفکر» block
 *   text / user           → warm bubble on the physical right (see the module
 *                           CSS note) with Copy kept per ADR #21 — a documented
 *                           deviation from 09b FR5's assistant-only actions
 *   text / assistant      → full-width column stack (09b row 2's
 *                           flush-left anchor was removed after manual
 *                           DevTools testing - see the module CSS note),
 *                           no bubble, with Copy plus the export's
 *                           own date when present (09b row 4; ADR #18 keeps the
 *                           row Copy-only — no decorative icons), fenced
 *                           code as code blocks, Markdown as HTML
 *   text / unknown role   → simplified muted rendering — never a crash
 *                           (Unit 03's unknown-fragment edge case)
 *
 * Payload fields are optional on `UnifiedMessage` (ADR #6), so every accessor
 * here has an empty fallback: a malformed message degrades, it never throws.
 */
export function ClaudeMessage({ message, toolCards }: ClaudeMessageProps): JSX.Element {
  const { t } = useTranslation();

  if (message.kind === 'attachment') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="attachment">
        <AttachmentCard attachments={message.attachments ?? []} />
      </div>
    );
  }

  if (message.kind === 'tool_activity') {
    const card = toolCards.get(message.order);
    return (
      <div className={styles.row} data-role={message.role} data-kind="tool_activity">
        {/* `linkToolActivity` puts every tool message into a card; the guard
            only keeps a malformed record from crashing the renderer. */}
        {card === undefined ? null : <ToolBlock card={card} />}
      </div>
    );
  }

  // `kind === 'text'` is the only remaining kind.
  const content = message.content ?? '';

  if (message.sourceFragmentType === 'thinking') {
    return (
      <div
        className={styles.row}
        data-role={message.role}
        data-kind="text"
        data-fragment="thinking"
      >
        <ThinkingBlock content={content} />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className={`${styles.row} ${styles.userRow}`} data-role="user" data-kind="text">
        {/* Verbatim text in the bubble; Claude keeps user messages plain.
            The Copy affordance mirrors the assistant action row: same
            `CopyButton` component, same styling, copied state identical. */}
        <div className={styles.userMessage}>
          <ClaudeUserBubble content={content} />
          <div className={styles.actions}>
            <CopyButton text={content} label={t('themes.copyMessage')} />
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
  // 09b row 4: the date under the response comes only from the export's own
  // timestamp — absent or unparseable means no date, never a derived one.
  const actionDate = isKnownRole ? formatActionDate(message.createdAt) : undefined;

  return (
    <div
      className={`${styles.row} ${isKnownRole ? styles.assistantRow : styles.unknownRole}`}
      data-role={message.role}
      data-kind="text"
    >
      {isKnownRole ? null : (
        <span className={styles.unknownBadge}>{t('themes.unknownRole')}</span>
      )}
      <div className={styles.assistantBody}>
        {segments.map((segment, index) =>
          segment.type === 'code' ? (
            <CodeBlock key={index} segment={segment} />
          ) : (
            // Markdown pipeline: marked → DOMPurify → dangerouslySetInnerHTML.
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
          <CopyButton text={content} label={t('themes.copyAnswer')} />
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

/**
 * Formats the export's own message timestamp for the assistant action row
 * (`09b-claude-theme-visual-fix.md` row 4). Returns `undefined` for absent or
 * unparseable values, so the row renders without a date instead of inventing
 * one — the same verbatim rule as the metadata panel's `formatExportTimestamp`,
 * restyled here as a short date in the active locale (claude.ai shows a small
 * date beside the icons). The stored string itself is never altered
 * (`types/conversation.ts`).
 */
function formatActionDate(createdAt: string | undefined): string | undefined {
  if (createdAt === undefined) {
    return undefined;
  }
  const parsedMs = Date.parse(createdAt);
  return Number.isNaN(parsedMs)
    ? undefined
    : new Intl.DateTimeFormat(activeDateLocale(), { day: 'numeric', month: 'short' }).format(parsedMs);
}

/**
 * Unit 09d — collapsible user bubble (claude.ai parity).
 *
 * Local per-message state (FR6): each mounted bubble owns its own
 * `expanded` flag, so toggling one message never touches another.
 *
 * Detection is purely geometric (`scrollHeight > clientHeight` on the bubble
 * measured in the collapsed state), so it counts *rendered* line boxes after
 * wrapping — RTL/LTR and FA/EN independent (Validation), and long unwrappable
 * runs still obey the earlier `overflow-wrap: anywhere` rule (vertical clamp
 * never interferes with horizontal wrapping).
 */
function ClaudeUserBubble({ content }: { readonly content: string }): JSX.Element {
  const { t } = useTranslation();
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
          {expanded ? t('themes.showLess') : t('themes.showMore')}
        </button>
      )}
    </>
  );
}

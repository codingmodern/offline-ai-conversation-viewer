import { useState } from 'react';
import type { JSX } from 'react';
import type { UnifiedMessage } from '@/types/conversation';
import { AttachmentCard } from './AttachmentCard';
import { CopyButton } from './CopyButton';
import { DraftToggle } from './DraftToggle';
import { sanitizeMessageHtml, splitCodeBlocks, toPlainText } from './sanitizeHtml';
import styles from './GeminiMessage.module.css';

interface GeminiMessageProps {
  readonly message: UnifiedMessage;
}

/**
 * Maps one `UnifiedMessage` onto Gemini's visual pattern (`ui-context.md` §4.5),
 * dispatching on the Unit 03 `kind` discriminator:
 *
 *   attachment      → name-only placeholders (the export has no size or bytes)
 *   text / user     → very light blue bubble on the physical right, Copy only
 *   text / assistant→ no bubble: the sanitized pre-rendered HTML of the model's
 *                     answer, its code blocks given a Copy bar, a draft chip
 *                     when the turn has more than one draft, Copy and the
 *                     export's own date
 *   text / unknown  → simplified muted rendering, never a crash (Unit 03's
 *                     unknown-fragment edge case; Gemini's parser does not
 *                     produce one today)
 *
 * Payload fields are optional on `UnifiedMessage` (ADR #6), so every accessor
 * here has an empty fallback: a malformed message degrades, it never throws.
 *
 * The user's text is rendered as **text** (React escapes it), never as HTML:
 * Gemini's user side is a plain `title` string, and only the assistant side is
 * pre-rendered markup.
 */
export function GeminiMessage({ message }: GeminiMessageProps): JSX.Element {
  if (message.kind === 'attachment') {
    return (
      <div className={styles.row} data-role={message.role} data-kind="attachment">
        <AttachmentCard attachments={message.attachments ?? []} />
      </div>
    );
  }

  const content = message.content ?? '';

  if (message.role === 'user') {
    return (
      <div className={`${styles.row} ${styles.userRow}`} data-role="user" data-kind="text">
        <div className={styles.userMessage}>
          <div className={styles.userBubble}>{content}</div>
          <div className={styles.actions}>
            <CopyButton text={content} label="کپی پیام" />
          </div>
        </div>
      </div>
    );
  }

  return <GeminiAnswer message={message} />;
}

/**
 * The model's side of a turn — one assistant message, possibly with drafts.
 *
 * A component of its own because it owns the draft index: `GeminiMessage` early
 * returns per kind, and hooks may not run conditionally, so the state belongs
 * where an answer actually exists.
 *
 * Drafts: `content` is the first draft and `alternatives` the rest (ADR #25),
 * and the turn produced exactly one message — so this array, not the message
 * list, is what the draft chip steps through (FR11). Both the total and the
 * position come from the export and nothing is invented.
 *
 * Every draft is sanitized **before** it is rendered or split (NFR2,
 * Invariant #5): `splitCodeBlocks` only ever sees the output of
 * `sanitizeMessageHtml`, which is its own documented contract.
 */
function GeminiAnswer({ message }: GeminiMessageProps): JSX.Element {
  const [selected, setSelected] = useState(0);

  const drafts = [message.content ?? '', ...(message.alternatives ?? [])];
  // Defensive clamp: switching conversations reuses this instance when a row
  // keeps its `order` key, so a stale index from a two-draft answer must never
  // index past a one-draft answer (the answer would simply look empty).
  const activeIndex = selected < drafts.length ? selected : 0;
  const draft = drafts[activeIndex] ?? '';

  const sanitized = sanitizeMessageHtml(draft);
  const segments = splitCodeBlocks(sanitized);

  const isKnownRole = message.role === 'assistant';
  // The date comes only from the export's own turn timestamp — absent or
  // unparseable means no date, never a derived one (FR10, ADR #26).
  const actionDate = isKnownRole ? formatActionDate(message.createdAt) : undefined;

  return (
    <div
      className={`${styles.row} ${isKnownRole ? styles.assistantRow : styles.unknownRole}`}
      data-role={message.role}
      data-kind="text"
    >
      {isKnownRole ? null : <span className={styles.unknownBadge}>پیام با نقش ناشناخته</span>}
      <div className={styles.assistantBody}>
        {segments.map((segment, index) =>
          segment.kind === 'code' ? (
            // §4.5's Copy bar over the block's own surface. The code travels as
            // a React text child, so nothing has to be injected here at all.
            <figure key={index} className={styles.codeBlock} data-code-block="true">
              <figcaption className={styles.codeBar}>
                <span>کد</span>
                <CopyButton text={segment.value} label="کپی کد" />
              </figcaption>
              <pre className={styles.codePre}>
                <code className={styles.code}>{segment.value}</code>
              </pre>
            </figure>
          ) : (
            // Sanitized HTML only: `segment.value` is DOMPurify's own output,
            // round-tripped through the DOM without ever being re-escaped by
            // hand (Invariant #5 / ADR #21's rendering rule).
            <div
              key={index}
              className={styles.assistantText}
              data-html="true"
              dangerouslySetInnerHTML={{ __html: segment.value }}
            />
          ),
        )}
      </div>
      {isKnownRole && (
        <div className={styles.actions}>
          {drafts.length > 1 ? (
            <DraftToggle count={drafts.length} activeIndex={activeIndex} onSelect={setSelected} />
          ) : null}
          {/* The clipboard gets the text the user can read — not the export's
              markup (`toPlainText`) — and always the active draft. */}
          <CopyButton text={toPlainText(sanitized)} label="کپی پاسخ" />
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
 * Formats the export's own timestamp for the answer's action row.
 *
 * Returns `undefined` for absent or unparseable values, so the row renders
 * without a date instead of inventing one — the verbatim rule of ADR #26 and
 * `metadataFields.formatExportTimestamp`, restyled as the same short fa-IR date
 * the Claude theme shows (`Intl.DateTimeFormat('fa-IR', { day, month })`; ADR
 * #26 pins that format). What FR10's «Gregorian» rules out is calendar
 * conversion in the *data* layer: the stored string stays verbatim, and only
 * this display step formats it, in the app's own locale.
 */
function formatActionDate(createdAt: string | undefined): string | undefined {
  if (createdAt === undefined) {
    return undefined;
  }
  const parsedMs = Date.parse(createdAt);
  return Number.isNaN(parsedMs)
    ? undefined
    : new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(parsedMs);
}
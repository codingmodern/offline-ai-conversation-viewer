import type {
  UnifiedAttachment,
  UnifiedConversation,
  UnifiedMessage,
  UnifiedRole,
} from '@/types/conversation';
import type {
  GeminiRawConversation,
  GeminiRawData,
  GeminiRawTurn,
} from '@/parsers/gemini/types';

/**
 * Gemini → `UnifiedConversation` mapping.
 *
 * Reads **only** `parse()`'s output (`GeminiRawData`), never raw JSON
 * (`03-modular-parsing.md` NFR3). If a field is missing here, it was already
 * proven missing by the parser — so this layer contains no re-validation and
 * cannot fail.
 *
 * This is where Gemini's Activity vocabulary becomes the unified vocabulary
 * (`architecture.md` §2 → Internal Module Contracts):
 *
 * | Activity item payload | message                                   | role                          |
 * |-----------------------|-------------------------------------------|-------------------------------|
 * | `title`               | `text`, content = prefix-stripped title    | `user`                        |
 * | `safeHtmlItem[0]`     | `text`, content = pre-rendered HTML        | `assistant`                   |
 * | `safeHtmlItem[1..]`   | same message, kept in `alternatives`       | `assistant`                   |
 * | `attachedFiles`       | `attachment` (names only)                  | `user` with `imageFile`, else `assistant` |
 * | `imageFile`           | appended to those names when absent there  | as above                      |
 *
 * **One Activity item = one turn = one user message + one assistant message**
 * (ADR #24 decision 3) — never a conversation of its own, and never several
 * responses: `alternatives` holds the extra drafts of the *same* answer instead
 * (ADR #25). A turn whose `safeHtmlItem` was empty produces no answer message at
 * all rather than an empty one (NFR1).
 *
 * Time handling follows ADR #26: the turn's single `time` is stored verbatim on
 * both of its messages, and the conversation's `createdAt`/`updatedAt` are the
 * earliest/latest of those same verbatim strings.
 */

/**
 * The export's constant user-message prefix, a documented constant of *this*
 * export rather than a general language rule (ADR #24 decision 6).
 */
const REQUEST_PREFIX = 'درخواست: ';

/**
 * The single project-wide derived-title rule: 80 characters, then `…`
 * (ADR #24 decision 4). Exported so the budget is a named constant, exactly as
 * the ADR records it.
 */
export const TITLE_MAX_LENGTH = 80;

export function normalizeGemini(raw: GeminiRawData): readonly UnifiedConversation[] {
  return raw.conversations.map(toUnifiedConversation);
}

function toUnifiedConversation(conversation: GeminiRawConversation): UnifiedConversation {
  const messages: UnifiedMessage[] = [];
  for (const turn of conversation.turns) {
    appendTurn(messages, turn);
  }

  const title = deriveTitle(conversation.turns);
  const bounds = conversationBounds(conversation.turns);

  // `exactOptionalPropertyTypes`: absent metadata is omitted, never `undefined`.
  return {
    sourceProvider: 'gemini',
    sourceConversationId: conversation.id,
    // No conversation-level title or summary exists in this export: the title is
    // derived from the user's own first message, and nothing is invented.
    ...(title === undefined ? {} : { title }),
    ...bounds,
    messages,
  };
}

/**
 * Expands one Activity item into its unified messages, in place.
 *
 * Order is the reading order of the turn: the user's request, then the model's
 * answer (when the export recorded one), then the turn's file placeholders.
 */
function appendTurn(out: UnifiedMessage[], turn: GeminiRawTurn): void {
  const stamp = timestampOf(turn);

  out.push({
    role: 'user',
    kind: 'text',
    // Verbatim text minus the export's own prefix; empty stays empty instead of
    // becoming an error (architecture.md → Gemini: empty `title`).
    content: stripRequestPrefix(turn.title),
    // The export's own field this message came from (ADR #24 decision 5).
    sourceFragmentType: 'title',
    order: out.length,
    ...stamp,
  });

  const [firstDraft, ...rest] = turn.drafts;
  if (firstDraft !== undefined) {
    out.push({
      role: 'assistant',
      kind: 'text',
      // Pre-rendered HTML, verbatim: the theme sanitizes and renders it. It is
      // never converted to or from Markdown (FR7).
      content: firstDraft,
      // Absent — never an empty array — when the turn has a single answer.
      ...(rest.length === 0 ? {} : { alternatives: rest }),
      sourceFragmentType: 'safeHtmlItem',
      order: out.length,
      ...stamp,
    });
  }

  const names = attachmentNames(turn);
  if (names.length > 0) {
    out.push({
      role: attachmentOwner(turn),
      kind: 'attachment',
      attachments: names.map(toUnifiedAttachment),
      sourceFragmentType: attachmentSourceField(turn),
      order: out.length,
      ...stamp,
    });
  }
}

/**
 * The turn's single timestamp, verbatim, on **both** its messages (ADR #26):
 * Gemini records no separate time for the model's answer, and inventing one
 * would fabricate data.
 */
function timestampOf(turn: GeminiRawTurn): { readonly createdAt?: string } {
  return turn.time === undefined ? {} : { createdAt: turn.time };
}

/** Removes the export's constant prefix; a title without it is used whole (EC5). */
function stripRequestPrefix(title: string): string {
  return title.startsWith(REQUEST_PREFIX) ? title.slice(REQUEST_PREFIX.length) : title;
}

/**
 * The display title: the conversation's **first** user text, truncated
 * (ADR #24 decision 4).
 *
 * The first message the user actually wrote wins — an empty request does not
 * become the conversation's name. A conversation whose user text is empty
 * everywhere produces **no** title at all, so the Sidebar's own
 * «گفتگوی بی‌عنوان» label applies instead of a fabricated string (FR6).
 */
function deriveTitle(turns: readonly GeminiRawTurn[]): string | undefined {
  for (const turn of turns) {
    const text = stripRequestPrefix(turn.title);
    if (text !== '') {
      return truncateTitle(text);
    }
  }
  return undefined;
}

/**
 * Truncates to `TITLE_MAX_LENGTH` characters, appending `…` only when something
 * was cut.
 *
 * Counting is by code point, so a title ending in an emoji or any other
 * surrogate pair is cut between characters rather than inside one.
 */
function truncateTitle(text: string): string {
  const characters = Array.from(text);
  return characters.length <= TITLE_MAX_LENGTH
    ? text
    : `${characters.slice(0, TITLE_MAX_LENGTH).join('')}…`;
}

/**
 * The conversation's date bounds, derived from the only dates this export has:
 * its turns (ADR #26).
 *
 * Values are stored verbatim; a timestamp the platform cannot place on a
 * timeline (`Date.parse` fails) is skipped rather than forced into a bound that
 * would then disagree with the message order.
 */
function conversationBounds(
  turns: readonly GeminiRawTurn[],
): { readonly createdAt?: string; readonly updatedAt?: string } {
  let earliest: { readonly ms: number; readonly value: string } | undefined;
  let latest: { readonly ms: number; readonly value: string } | undefined;

  for (const turn of turns) {
    if (turn.time === undefined) {
      continue;
    }
    const ms = Date.parse(turn.time);
    if (Number.isNaN(ms)) {
      continue;
    }
    if (earliest === undefined || ms < earliest.ms) {
      earliest = { ms, value: turn.time };
    }
    if (latest === undefined || ms > latest.ms) {
      latest = { ms, value: turn.time };
    }
  }

  return {
    ...(earliest === undefined ? {} : { createdAt: earliest.value }),
    ...(latest === undefined ? {} : { updatedAt: latest.value }),
  };
}

/**
 * The turn's file names, verbatim and de-duplicated.
 *
 * `attachedFiles` is the list itself; `imageFile` is the uploaded image, which
 * the census shows repeated inside `attachedFiles` — appending it only when it
 * is absent keeps one placeholder per file while still surfacing an upload the
 * export listed nowhere else.
 */
function attachmentNames(turn: GeminiRawTurn): readonly string[] {
  const { imageFile } = turn;
  if (imageFile === undefined || turn.attachedFiles.includes(imageFile)) {
    return turn.attachedFiles;
  }
  return [...turn.attachedFiles, imageFile];
}

/**
 * Who the turn's files belong to.
 *
 * The export's own discriminator (spec EC3/EC4): a turn carrying `imageFile` is
 * one where the user uploaded a file («۱ فایل پیوست شد.»), and a turn carrying
 * only `attachedFiles` is one where the **model** produced the image
 * («۱ تصویر تولید شد.»). Attaching a generated image to the user would
 * misattribute the model's own output.
 */
function attachmentOwner(turn: GeminiRawTurn): UnifiedRole {
  return turn.imageFile === undefined ? 'assistant' : 'user';
}

/** The export field the file names came from (`attachedFiles`, else `imageFile`). */
function attachmentSourceField(turn: GeminiRawTurn): string {
  return turn.attachedFiles.length > 0 ? 'attachedFiles' : 'imageFile';
}

/**
 * Maps a file name onto the unified attachment.
 *
 * This export carries no file id, no size and no bytes — only the name — so the
 * name *is* the only identifier the export provides, and `fileSize` stays absent
 * instead of being fabricated as zero.
 */
function toUnifiedAttachment(fileName: string): UnifiedAttachment {
  return { fileId: fileName, fileName };
}
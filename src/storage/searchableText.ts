import type { UnifiedAttachment, UnifiedConversation } from '@/types/conversation';

/**
 * Builds the per-conversation haystack the in-memory search index filters
 * against (Unit 07, ADR #19).
 *
 * Contents, per the approved searchable-content rules:
 *   - the conversation `title` (when the export carried one),
 *   - the `content` of every `kind: 'text'` message (REQUEST/RESPONSE/THINK,
 *     ADR #7), and
 *   - the `fileName` of every `kind: 'attachment'` message — finding a
 *     conversation by a remembered attached file's name is real user value for
 *     near-zero cost.
 *
 * `kind: 'tool_activity'` messages contribute **nothing**: their only payload is
 * `results`, whose inner shape is undocumented (ADR #18). Searching it would
 * mean parsing an undocumented structure — inventing product behaviour — so this
 * builder deliberately never even reads the field.
 *
 * Returned text is **lowercased** so callers can fold only the (tiny) query per
 * keystroke instead of re-folding the whole corpus — that trade-off is the point
 * of the in-memory index (NFR1/NFR3). Case-folding only (no NFC/ZWNJ/casefold
 * normalisation, v1): Persian letters carry no case so they survive byte-for-byte,
 * and a query typed the way the text was written matches. Known blind spots,
 * accepted this version and recorded in the ADR: Arabic Yeh/Kaf spellings
 * («ي/ك» vs «ی/ک») and hard vs soft-break character variants do not cross-match,
 * the same category of pitfall as Unit 05's `[۰-۹]` vs `\d` lesson.
 *
 * Pieces are joined with `'\n'` so a title ending "اب" can never merge with a
 * message starting "چه" into a false "ابچه" hit; a single-line search input
 * cannot produce a needle containing a newline.
 */
export function buildSearchableText(conversation: UnifiedConversation): string {
  const pieces: string[] = [];

  if (conversation.title !== undefined) {
    pieces.push(conversation.title);
  }

  for (const message of conversation.messages) {
    if (message.kind === 'text' && message.content !== undefined) {
      pieces.push(message.content);
      continue;
    }
    if (message.kind === 'attachment') {
      // `attachments` exists whenever `kind === 'attachment'` (normalization
      // guarantees it), but a defensive loop over the possible-absent field
      // keeps a malformed record from throwing inside the live query.
      const attachments: readonly UnifiedAttachment[] = message.attachments ?? [];
      for (const attachment of attachments) {
        pieces.push(attachment.fileName);
      }
    }
    // `tool_activity`: intentionally unreachable-by-search (see docstring).
  }

  return pieces.join('\n').toLowerCase();
}

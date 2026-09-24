import type { UnifiedConversation } from '@/types/conversation';

/**
 * Declarative description of ONE conversation-level metadata field
 * (`05-conversation-metadata.md` FR3 / NFR2, per the approved ADR #16).
 *
 * Why a descriptor list and not per-field JSX or a fully dynamic renderer:
 *   - FR3 forbids hardcoding each field separately in the UI — a future field is
 *     added by appending one entry here; the rendering component iterates the
 *     list unchanged.
 *   - `UnifiedConversation` has no open-ended metadata bag today, so an
 *     arbitrary-schema renderer would have nothing legitimate to iterate. The
 *     typed accessor keeps every entry honest against the real model (FR6).
 *
 * **`messageCount` is deliberately NOT an entry.** FR2 makes it always present
 * ("0" is valid), so it is structural UI rendered unconditionally by the panel,
 * not an optional field that may silently disappear. Keeping it out also holds
 * the accessors pure reads of existing fields — no aggregation logic lives here.
 *
 * Per-message-only fields (`model`) must never be added to this list either:
 * there is no single correct conversation-level value without aggregation
 * (`types/conversation.ts` → `UnifiedMessage.model`; ADR #15).
 */
export type MetadataFieldValue = string | number;

export interface ConversationFieldDescriptor {
  /** Stable identity for rendering keys and tests. */
  readonly key: string;
  /** Persian display label (`ui-context.md` §2 — RTL Persian Shell). */
  readonly label: string;
  /**
   * Reads the field off the conversation, returning exactly what exists —
   * verbatim values only, never derived ones (FR6). Returning `undefined`/`null`
   * means "not available in this export", which drops the row from the panel.
   */
  readonly accessor: (conversation: UnifiedConversation) => MetadataFieldValue | null | undefined;
  /**
   * Optional display formatter, declared per entry so formatting stays part of
   * the same one-entry-per-field change (NFR2). Defaults to verbatim text.
   */
  readonly format?: (value: MetadataFieldValue) => string;
}

/**
 * Formats an exported timestamp for display in the Persian locale
 * (`ui-context.md` §2). Unparseable strings stay verbatim: reformatting is a
 * presentation concern, but inventing a date the export did not state is not
 * (`05-conversation-metadata.md` FR6).
 */
function formatExportTimestamp(value: MetadataFieldValue): string {
  const parsedMs = Date.parse(String(value));
  return Number.isNaN(parsedMs)
    ? String(value)
    : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        parsedMs,
      );
}

/**
 * Every optional conversation-level field the panel can show, in display order.
 *
 * `summary` leads because it is Claude's own conversation-level abstract
 * (Unit 09): the export records it for every conversation, so a Claude record
 * almost always opens with it. DeepSeek exports have no such field — the
 * accessor returns `undefined` and the row silently disappears (FR4).
 *
 * Values are read verbatim from `UnifiedConversation` (`types/conversation.ts`);
 * timestamps are formatted for display via their entries' own `format`.
 */
export const CONVERSATION_METADATA_FIELDS: readonly ConversationFieldDescriptor[] = [
  {
    key: 'summary',
    label: 'خلاصه',
    accessor: (conversation) => conversation.summary,
  },
  { key: 'title', label: 'عنوان', accessor: (conversation) => conversation.title },
  {
    key: 'createdAt',
    label: 'تاریخ ایجاد',
    accessor: (conversation) => conversation.createdAt,
    format: formatExportTimestamp,
  },
  {
    key: 'updatedAt',
    label: 'آخرین به‌روزرسانی',
    accessor: (conversation) => conversation.updatedAt,
    format: formatExportTimestamp,
  },
];

/** One descriptor whose value actually exists on a given conversation. */
export interface ResolvedMetadataField {
  readonly key: string;
  readonly label: string;
  /** Display-ready text; absent fields never produce an entry at all. */
  readonly value: string;
}

/**
 * Applies the descriptors to one conversation and returns ONLY the fields it
 * actually has (`05-conversation-metadata.md` FR4 + Validation).
 *
 * An accessor returning `undefined`/`null` contributes no entry — no placeholder,
 * no fabricated value, no error — so a missing field can never break the row
 * after it or the view around it. Pure function: same input, same rows.
 */
export function resolveMetadataFields(
  conversation: UnifiedConversation,
  fields: readonly ConversationFieldDescriptor[] = CONVERSATION_METADATA_FIELDS,
): ResolvedMetadataField[] {
  const resolved: ResolvedMetadataField[] = [];
  for (const field of fields) {
    const value = field.accessor(conversation);
    if (value !== undefined && value !== null) {
      resolved.push({
        key: field.key,
        label: field.label,
        value: field.format === undefined ? String(value) : field.format(value),
      });
    }
  }
  return resolved;
}

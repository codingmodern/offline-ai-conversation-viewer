import type { UnifiedConversation } from '@/types/conversation';
import { activeDateLocale } from '@/i18n';

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
  /**
   * Human-readable fallback label or raw label for custom fields (FR3/NFR2).
   * When `labelKey` is provided, i18n translates it; otherwise `label` is shown verbatim.
   */
  readonly label?: string;
  /**
   * Translation key for the display label (Unit 12) — resolved to copy by the
   * rendering component, so the panel follows the chosen language. A key rather
   * than Persian text keeps this module free of copy, exactly as it is free of
   * colour and layout.
   */
  readonly labelKey?: string;
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
 * Formats an exported timestamp for display in the **active** UI locale
 * (Unit 12: `fa` → Jalali/Persian digits, `en` → Gregorian). Unparseable strings
 * stay verbatim: reformatting is a presentation concern, but inventing a date the
 * export did not state is not (`05-conversation-metadata.md` FR6).
 */
function formatExportTimestamp(value: MetadataFieldValue): string {
  const parsedMs = Date.parse(String(value));
  return Number.isNaN(parsedMs)
    ? String(value)
    : new Intl.DateTimeFormat(activeDateLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
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
    labelKey: 'metadata.fieldSummary',
    accessor: (conversation) => conversation.summary,
  },
  {
    key: 'title',
    label: 'عنوان',
    labelKey: 'metadata.fieldTitle',
    accessor: (conversation) => conversation.title,
  },
  {
    key: 'createdAt',
    label: 'تاریخ ایجاد',
    labelKey: 'metadata.fieldCreatedAt',
    accessor: (conversation) => conversation.createdAt,
    format: formatExportTimestamp,
  },
  {
    key: 'updatedAt',
    label: 'آخرین به‌روزرسانی',
    labelKey: 'metadata.fieldUpdatedAt',
    accessor: (conversation) => conversation.updatedAt,
    format: formatExportTimestamp,
  },
];

/** One descriptor whose value actually exists on a given conversation. */
export interface ResolvedMetadataField {
  readonly key: string;
  /**
   * The human-readable label or its raw string (preserved for custom descriptors).
   * In standard descriptors, this holds the resolved or default Persian label so
   * consumers not using i18n can still display a label.
   */
  readonly label?: string;
  /** Translation key for the label; the panel resolves it at render time. */
  readonly labelKey?: string;
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
        ...(field.label !== undefined ? { label: field.label } : {}),
        ...(field.labelKey !== undefined ? { labelKey: field.labelKey } : {}),
        value: field.format === undefined ? String(value) : field.format(value),
      });
    }
  }
  return resolved;
}

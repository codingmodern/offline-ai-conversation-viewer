import type { ProviderRawData } from '@/types/providers';

/**
 * ChatGPT **Provider Raw Data** — the output of `parse()` and the only input
 * `normalization/chatgpt.ts` accepts.
 *
 * Why a provider-specific shape instead of `UnifiedConversation`: Unit 03 FR1
 * keeps parsing structural. `parse()` proves the export's shape, resolves the
 * active branch (FR-4) and flattens it into reading order; deciding what a
 * role, a content type or a citation marker means in the unified model is
 * normalization's job (FR3/NFR3).
 *
 * **Provisional shape** (spec 11 → Research Basis / ADR-A): no real ChatGPT
 * export was available, so this is derived from the spec's third-party research
 * cross-check plus the owner-supplied sample
 * (`tests/fixtures/chatgpt/minimal.json`). Fields the sources do not prove are
 * optional rather than assumed, and every unverified field is marked as such.
 */

/**
 * One attachment entry, from the message metadata's `attachments[]`.
 *
 * Only entries whose shape was recognised are carried; anything else is ignored
 * silently (FR-8) rather than guessed at. `fileId` is the only part the unified
 * attachment requires, so an entry without an id or a name is not recognised.
 *
 * Image pointers (`image_asset_pointer` inside `content.parts`) are **not**
 * listed here — they stay in `parts` so normalization can map them without
 * duplicating them.
 */
export interface ChatGptRawAttachment {
  /** Asset pointer (`sediment://…`, `file-service://…`) or attachment id, verbatim. */
  readonly fileId: string;
  /**
   * The attachment's own name, when the export recorded one.
   *
   * Absent for an image pointer (a pointer has no name), in which case
   * normalization substitutes the project's placeholder label.
   */
  readonly fileName?: string;
  /** Size in bytes, only when the export stated one — never fabricated (FR-8). */
  readonly fileSize?: number;
}

/**
 * One message from the active branch, still carrying ChatGPT's vocabulary.
 *
 * Extraction is structural: nothing here has been mapped to a role, a `kind` or
 * a citation-stripped string. The payload fields are kept separate by
 * optionality (like Claude's fragments) instead of a category discriminator,
 * because normalization switches on the verbatim `contentType` (FR-6).
 */
export interface ChatGptRawMessage {
  /** The message's own `id`, verbatim and opaque (no UUID format assumed, FR-9). */
  readonly id?: string;
  /** Verbatim `author.role`: the export's own vocabulary (`user`, `assistant`, `tool`, …). */
  readonly role: string;
  /**
   * Verbatim `author.name` when it is a non-empty string.
   *
   * This is where a tool call states the tool it addressed (FR-6 → `toolName`).
   */
  readonly authorName?: string;
  /**
   * Verbatim `message.recipient`.
   *
   * Defaults to `'all'` when the export omits it: "addressed to a tool" is
   * modelled as `recipient !== 'all'` (FR-6), so an absent value must not be
   * read as tool addressing. Kept verbatim otherwise.
   */
  readonly recipient: string;
  /** Verbatim `content.content_type` (FR-6's dispatch key). */
  readonly contentType: string;
  /**
   * Verbatim `message.text` — the message-level mirror, when the export carried one.
   *
   * For some content types (notably `reasoning_recap`) the body lives in
   * `content.text` instead; normalization's extraction order distinguishes the
   * two (FR-6).
   */
  readonly text?: string;
  /**
   * Verbatim `content.text`, when the content object carried one.
   *
   * FR-6's last named extraction source ("string, e.g. `reasoning_recap`"):
   * checked after `parts`, the mirror, `result` and `thoughts`, never first.
   */
  readonly contentText?: string;
  /**
   * `content.parts` verbatim, in export order — strings and objects alike.
   *
   * Kept unflattened so normalization can honour FR-6's "one payload per
   * message" rule (a string part becomes text, an `image_asset_pointer` part
   * becomes an attachment, any other object part becomes a placeholder) without
   * re-reading the file.
   */
  readonly parts: readonly unknown[];
  /** `content.thoughts` verbatim; empty when absent (reasoning is extracted from here). */
  readonly thoughts: readonly unknown[];
  /** `content.result` verbatim, when present — FR-6's fourth text-extraction source. */
  readonly result?: unknown;
  /**
   * Verbatim `message.channel` when it is a non-empty string.
   *
   * The spec marks "assistant + channel = commentary" as assistant reasoning
   * text **[Unverified]**, which normalization keeps distinguishable through
   * `sourceFragmentType` (ADR-G).
   */
  readonly channel?: string;
  /** Verbatim `message.weight`, when stated (`0` is a real value, not "absent"). */
  readonly weight?: number;
  /** `metadata.is_visually_hidden_from_conversation === true` (FR-5 hiding). */
  readonly hiddenFromConversation: boolean;
  /** Verbatim `metadata.model_slug`, when present (FR-9). */
  readonly modelSlug?: string;
  /**
   * The message's own time in Unix **seconds**, verbatim — or the nearest
   * ancestor's when the message itself carried none (FR-9).
   *
   * Resolution happens here because only the parser holds the parent graph. The
   * value keeps the export's own unit: FR-9's single conversion to ISO-8601
   * belongs to normalization (ADR-I).
   */
  readonly createTime?: number;
  /**
   * The message's `content` object verbatim.
   *
   * Kept so an unrecognised `content_type` can be preserved in the unified
   * `sourceFragment` instead of being dropped (FR-6's last row).
   */
  readonly rawContent: unknown;
  /** Recognised attachments only: image pointers from `parts`, plus metadata `attachments[]`. */
  readonly attachments: readonly ChatGptRawAttachment[];
}

/** One conversation from the export, with its active branch already flattened. */
export interface ChatGptRawConversation {
  /**
   * The conversation id: the export's `id`, falling back to `conversation_id`
   * (FR-9). Always usable — a conversation with neither is skipped instead
   * (ADR-J), never given a fabricated id, because storage refuses a record
   * without a non-empty `sourceConversationId`.
   */
  readonly id: string;
  /** Verbatim `title`; absent when the export omitted it or left it empty (FR-9). */
  readonly title?: string;
  /** Verbatim `create_time`, in Unix seconds — not yet converted (ADR-I). */
  readonly createTime?: number;
  /** Verbatim `update_time`, in Unix seconds — not yet converted (ADR-I). */
  readonly updateTime?: number;
  /**
   * Verbatim `default_model_slug`.
   *
   * Carried so nothing in the export is lost at parse time, but deliberately
   * **not** mapped by normalization: the shared model has no conversation-level
   * model field (ADR #15 forbids aggregating `UnifiedMessage.model`), so 11b
   * reads the per-message slug instead.
   */
  readonly defaultModelSlug?: string;
  /**
   * Messages of the active branch in reading order (FR-4): the `current_node`
   * path when usable, otherwise the last-child line, otherwise every message
   * ordered by time. Structural nodes and messages failing the minimal message
   * shape are absent — never emitted empty.
   */
  readonly messages: readonly ChatGptRawMessage[];
}

/**
 * A conversation the parser refused, with the reason recorded (ADR-J).
 *
 * ChatGPT isolates conversations (FR-3): one damaged element must not make a
 * whole real export unreadable. The reason is technical detail kept for
 * diagnostics and tests — no UI surface for it exists in this sub-unit.
 */
export interface ChatGptSkippedConversation {
  /** The conversation's id, when the export stated a usable one; absent otherwise. */
  readonly id?: string;
  /** Why it was skipped, e.g. `missing mapping`. */
  readonly reason: string;
}

/** All conversations in one ChatGPT export file (or one shard of one export). */
export interface ChatGptRawData extends ProviderRawData {
  readonly providerId: 'chatgpt';
  /** Conversations that parsed, in file order. Never empty — see ADR-J. */
  readonly conversations: readonly ChatGptRawConversation[];
  /** Conversations that were skipped, with a reason each (FR-3, ADR-J). */
  readonly skipped: readonly ChatGptSkippedConversation[];
}

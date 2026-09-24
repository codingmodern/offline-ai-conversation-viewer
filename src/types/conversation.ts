import type { ProviderId } from '@/types/providers';

/**
 * The platform-independent conversation model (`architecture.md` §2, Data Flow
 * step 5). Everything downstream — view, search, storage — reads *only* this
 * shape and never a provider's own format.
 *
 * Produced exclusively by `normalization/` (`03-modular-parsing.md` FR3 /
 * NFR3). Parsers must never build it: they return Provider Raw Data instead.
 *
 * Optional fields are genuinely optional: not every platform exports a title or
 * timestamps. Under `exactOptionalPropertyTypes` they are *omitted*, never set
 * to `undefined`, so `'title' in conversation` stays meaningful.
 */

/**
 * Who produced a message, once mapped off platform-specific vocabulary
 * (DeepSeek `REQUEST`/`RESPONSE`, ChatGPT `author.role`, …).
 *
 * `unknown` exists so an unrecognised sender kind can be *preserved* rather than
 * dropped: losing a message is worse than labelling it imprecisely
 * (`03-modular-parsing.md` → Edge Cases).
 */
export type UnifiedRole = 'user' | 'assistant' | 'unknown';

/**
 * What a message *carries*, independent of who sent it.
 *
 * Why a discriminator instead of treating every message as text: a real DeepSeek
 * export (2026-08-20) contains fragments whose payload is not `content` at all —
 * `FILE` carries `files`, and `SEARCH`/`TOOL_SEARCH`/`TOOL_OPEN`/`TOOL_FIND`
 * carry `results` or nothing. Modelling `content` as mandatory made those
 * fragments a `MissingFieldError` and blocked the whole import
 * (`architecture.md` §7 → Edge Cases).
 *
 * `kind` decides which payload field is present, and *which fields are critical*
 * at parse time — criticality is per-kind, never global.
 */
export type UnifiedMessageKind = 'text' | 'attachment' | 'tool_activity';

/** A file a message carried, described only by what the export actually states. */
export interface UnifiedAttachment {
  readonly fileId: string;
  readonly fileName: string;
  /**
   * Size in bytes, when the export records one.
   *
   * DeepSeek always provides `file_size`; Claude's export proves only
   * `file_uuid`/`file_name` — no size — so this is optional and omitted
   * (never zero-fabricated) when the source has none.
   */
  readonly fileSize?: number;
}

/**
 * A tool/search step the assistant performed.
 *
 * `results` is deliberately `unknown` and stored verbatim: its inner shape is not
 * documented, differs per activity type, and interpreting it here would invent
 * product behaviour (`ai-workflow-rules.md` §3). Rendering decides later how much
 * of it to surface.
 *
 * The `tool*` fields carry Claude's `tool_use`/`tool_result` pair (Unit 09):
 * `toolUseId` links a result back to its invocation, `toolInput`/`toolOutput`
 * are the verbatim payloads, and `toolIsError` is the export's own error flag.
 * They stay optional so DeepSeek's `SEARCH`/`TOOL_*` fragments (which carry
 * none of them) map onto the same interface unchanged.
 */
export interface UnifiedToolActivity {
  /** Raw fragment type, e.g. `SEARCH` / `TOOL_SEARCH` / `TOOL_OPEN` / `tool_use`. */
  readonly activityType: string;
  /** Raw `results` payload when the export carried one; absent otherwise — never fabricated. */
  readonly results?: unknown;
  /** Claude: the invocation's `id` (on `tool_use`) or the matched `tool_use_id` (on `tool_result`). */
  readonly toolUseId?: string;
  /** Claude: the tool's own name, e.g. `web_search`, `bash_tool`. */
  readonly toolName?: string;
  /** Claude: verbatim `input` of a `tool_use` — any JSON, never reshaped. */
  readonly toolInput?: unknown;
  /** Claude: verbatim `content` of a `tool_result` — an array of typed blocks. */
  readonly toolOutput?: unknown;
  /** Claude: the export's own `is_error` flag on a `tool_result`. */
  readonly toolIsError?: boolean;
}

/**
 * A single message in a conversation.
 *
 * The payload fields are mutually exclusive by `kind`:
 * `text` → `content`, `attachment` → `attachments`, `tool_activity` → `toolActivity`.
 * They are optional (rather than a discriminated union of three interfaces) so an
 * *unrecognised* fragment type can still be preserved as `text` with no content
 * instead of being dropped or rejected (ADR #6).
 */
export interface UnifiedMessage {
  readonly role: UnifiedRole;
  /** Which payload this message carries. Set by normalization for every message. */
  readonly kind: UnifiedMessageKind;
  /** Plain text body, exactly as exported — never trimmed or re-formatted. Only when `kind === 'text'`. */
  readonly content?: string;
  /**
   * Alternative bodies for the *same* message, when the platform recorded more
   * than one answer to one turn (Gemini's multiple drafts — Unit 10, ADR #25).
   *
   * These are **alternatives, not extra messages**: the platform presented one
   * answer at a time and the user picked (or regenerated) between them, so
   * concatenating them into `content` would fabricate a reply that was never
   * sent, and emitting one message per draft would inflate the conversation.
   * `content` always holds the first draft; this array holds the rest, in the
   * export's own order, and is **omitted entirely** (never empty) when the turn
   * has a single answer. A renderer offers them as a draft selector.
   *
   * Only Gemini populates it; the field exists on the shared model because
   * duplicating message models per provider is forbidden
   * (`code-standards.md` §2) — same reasoning as `sourceFragmentType`.
   */
  readonly alternatives?: readonly string[];
  /** Files this message carried. Only when `kind === 'attachment'`. */
  readonly attachments?: readonly UnifiedAttachment[];
  /** Tool/search step this message represents. Only when `kind === 'tool_activity'`. */
  readonly toolActivity?: UnifiedToolActivity;
  /**
   * The provider's own fragment type, verbatim (`REQUEST`, `THINK`, `TOOL_OPEN`, …).
   *
   * Kept because `role` + `kind` are lossy on purpose: `THINK` and `RESPONSE` are
   * both assistant text, but a renderer must be able to tell reasoning from a
   * final answer without re-parsing the source file.
   */
  readonly sourceFragmentType: string;
  /**
   * The provider's own fragment object, verbatim, preserved only when the
   * fragment type was *not* recognised at parse time (Claude, Unit 09).
   *
   * An unknown fragment becomes a `text` message with no `content` plus this
   * field, so nothing is ever silently dropped and a future unit can still
   * recover exactly what the export carried. Absent for all known types.
   */
  readonly sourceFragment?: unknown;
  /**
   * 0-based position in the conversation. Explicit (rather than implied by array
   * index) so ordering survives filtering and virtualization in later units.
   */
  readonly order: number;
  /** Model that produced this message, when the export records one per message. */
  readonly model?: string;
  /** Original timestamp string, kept verbatim; formatting is the UI's concern. */
  readonly createdAt?: string;
}

/** One conversation, normalized. */
export interface UnifiedConversation {
  /** Which platform this came from. Set by normalization, never by the user. */
  readonly sourceProvider: ProviderId;
  /**
   * The conversation's id *in the source export*. Kept so re-importing the same
   * file can be recognised later (Storage unit) without inventing ids here.
   */
  readonly sourceConversationId: string;
  readonly title?: string;
  /**
   * The export's own conversation-level summary, verbatim (Claude records one
   * per conversation). Optional because it is presence-proven, not guaranteed.
   */
  readonly summary?: string;
  readonly createdAt?: string;
  /**
   * The export's own conversation-level "last updated" value, verbatim.
   *
   * Never recomputed from the newest message's timestamp (ADR #8): the platform
   * records this itself, and the two differ whenever a conversation changes
   * without gaining a message. Deriving "time of last message" from `messages`
   * stays possible; recovering an overwritten exported value does not.
   */
  readonly updatedAt?: string;
  readonly messages: readonly UnifiedMessage[];
}

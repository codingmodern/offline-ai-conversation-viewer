import type { ProviderRawData } from '@/types/providers';

/**
 * Claude **Provider Raw Data** — the output of `parse()` and the only input
 * `normalization/claude.ts` accepts.
 *
 * Why a provider-specific shape instead of `UnifiedConversation`: Unit 03 FR1
 * keeps parsing structural. `parse()` proves the export's shape and flattens the
 * `parent_message_uuid` tree into reading order; deciding what a "role" or a
 * "summary" means in the unified model is normalization's job (FR3/NFR3).
 *
 * Derived strictly from a census of the real local export (29 conversations,
 * 2005 messages — see `context/fixtures/claude/README.md`,
 * `ai-workflow-rules.md` §3). Fields the export does not prove are optional
 * rather than assumed.
 */

/**
 * A message fragment, still carrying Claude's own vocabulary.
 *
 * The census attested exactly four fragment types inside a message's
 * `content` array — `text` (2058), `thinking` (658), `tool_use` (366),
 * `tool_result` (366) — and this interface keeps their payloads apart by
 * optionality instead of a `category` discriminator: normalization switches on
 * the verbatim `type`, and the optional fields record *which* payloads this
 * fragment actually carried.
 */
export interface ClaudeRawFragment {
  /**
   * Verbatim `type` from the export.
   *
   * Attested values: `text`, `thinking`, `tool_use`, `tool_result`.
   *
   * Kept as a raw `string`, not a union: an unrecognised kind must survive
   * parsing so normalization can preserve the message instead of dropping it
   * (`03-modular-parsing.md` → Edge Cases).
   */
  readonly type: string;

  /** Text body. Required for `type === 'text'`. */
  readonly text?: string;

  /**
   * Reasoning body for `type === 'thinking'`. Empty string on hidden fragments
   * (the export blanks the body it hid); absent when the export omitted it.
   */
  readonly thinking?: string;
  /** The fragment's own `thinking_hidden` flag, when it carried one. */
  readonly thinkingHidden?: boolean;
  /**
   * `summaries[0].summary` — the platform's own one-line replacement for the
   * hidden body. Absent when `summaries` was absent or empty.
   */
  readonly thinkingSummary?: string;

  /** Invocation id (`tool_use.id`) — required for `type === 'tool_use'`. */
  readonly toolId?: string;
  /** Verbatim `input` of a `tool_use` — any JSON, never reshaped. */
  readonly toolInput?: unknown;
  /** Verbatim tool name, e.g. `web_search`, `bash_tool`. */
  readonly toolName?: string;
  /** Link-back id (`tool_result.tool_use_id`) — required for `type === 'tool_result'`. */
  readonly toolUseId?: string;
  /** Verbatim `content` of a `tool_result` — an array of typed blocks. */
  readonly toolOutput?: unknown;
  /** The export's own `is_error` flag on a `tool_result`. */
  readonly toolIsError?: boolean;

  /**
   * The fragment object exactly as exported, kept for types outside the
   * attested table so normalization can preserve them verbatim instead of
   * dropping them. Absent for every recognised type.
   */
  readonly sourceFragment?: unknown;
}

/**
 * A file entry from a message's `files` array.
 *
 * Keys observed in the real export: `file_uuid`, `file_name` only — no size,
 * no path, no content (`file_name` can be an empty string, kept verbatim). A
 * different shape is a new edge case to flag, not to silently tolerate
 * (`ai-workflow-rules.md` §3 — never invent product behaviour).
 */
export interface ClaudeRawFile {
  readonly fileId: string;
  readonly fileName: string;
}

/** One message from the export, already flattened into reading order. */
export interface ClaudeRawMessage {
  readonly id: string;
  /** Verbatim sender: `human` or `assistant` (nothing else was attested). */
  readonly sender: string;
  /** Verbatim timestamp string; never parsed into a `Date` here. */
  readonly createdAt?: string;
  readonly updatedAt?: string;
  /**
   * The export's own message-level `text` mirror. Kept only for messages whose
   * `content` array carried no fragments (7 attested) — there it is the only
   * body there is. Messages with fragments ignore the mirror: the fragments
   * are authoritative and the mirror is derivative.
   */
  readonly text?: string;
  /**
   * Fragments in conversation order, obtained by walking the
   * `parent_message_uuid` tree from the sentinel root — *not* by sorting on
   * timestamps and *not* by array order.
   *
   * Why: the export stores every branch of every regenerate/edit, and array
   * order mixes dead siblings into the flow. The live line is exactly one
   * child per node (ADR #22 — the **last** child, which is the newest and the
   * only one whose line continues).
   */
  readonly fragments: readonly ClaudeRawFragment[];
  /** Files the message's own `files` array carried (empty when absent). */
  readonly files: readonly ClaudeRawFile[];
}

/** One conversation from the export. */
export interface ClaudeRawConversation {
  readonly id: string;
  /** Verbatim `name`. Present on every attested conversation, still optional. */
  readonly title?: string;
  /** Verbatim `summary` — always present in the census, two are empty strings. */
  readonly summary?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  /**
   * Messages in conversation order (sentinel-rooted last-child walk, ADR #22).
   * A message's own fragment order inside `fragments` is export array order.
   */
  readonly messages: readonly ClaudeRawMessage[];
}

/** All conversations in one Claude export file. */
export interface ClaudeRawData extends ProviderRawData {
  readonly providerId: 'claude';
  /** A single export file can contain many conversations (29 in the real one). */
  readonly conversations: readonly ClaudeRawConversation[];
}


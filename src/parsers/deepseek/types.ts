import type { ProviderRawData } from '@/types/providers';

/**
 * DeepSeek **Provider Raw Data** — the output of `parse()` and the only input
 * `normalization/deepseek.ts` accepts.
 *
 * Why a provider-specific shape instead of `UnifiedConversation`: Unit 03 FR1
 * keeps parsing structural. `parse()` proves the export's shape and flattens the
 * `mapping` graph into ordered messages; deciding what a "role" or a "title"
 * means in the unified model is normalization's job (FR3/NFR3).
 *
 * Derived strictly from the real anonymized exports in `tests/fixtures/deepseek/`
 * (`ai-workflow-rules.md` §3). Fields the fixtures do not prove are optional
 * rather than assumed.
 */

/**
 * A file referenced by a `FILE` fragment, with DeepSeek's own key names mapped to
 * camelCase but no values interpreted.
 *
 * Keys observed in the real export: `file_id`, `file_name`, `file_size`. No other
 * shape has been seen; a different one is a new edge case to flag, not to
 * silently tolerate (§3 — never invent product behaviour).
 */
export interface DeepSeekRawFile {
  readonly fileId: string;
  readonly fileName: string;
  readonly fileSize: number;
}

/**
 * Which payload a fragment carries, decided by its `type`.
 *
 * This exists because the original fixture only contained `REQUEST`/`RESPONSE`,
 * so `content` looked mandatory. A full census of a real export (2026-08-20)
 * proved otherwise — 8 types across 3 payload categories — and treating `content`
 * as universally critical made every `FILE`/`SEARCH`/`TOOL_*` fragment a
 * `MissingFieldError` that blocked the entire import.
 *
 * Note this is a *structural* category (which fields must exist), not a semantic
 * one: mapping it to a role or a unified `kind` stays in `normalization/` (FR1).
 */
export type DeepSeekFragmentCategory = 'text' | 'attachment' | 'toolActivity';

/**
 * A message fragment, still carrying DeepSeek's own vocabulary.
 *
 * Exactly one payload field is populated, chosen by `category`:
 * `text` → `content`, `attachment` → `files`, `toolActivity` → optional `results`.
 */
export interface DeepSeekRawFragment {
  /**
   * Verbatim `type` from the export.
   *
   * Attested values: `REQUEST`, `RESPONSE`, `THINK` (text); `FILE` (attachment);
   * `SEARCH`, `TOOL_SEARCH`, `TOOL_OPEN`, `TOOL_FIND` (tool activity).
   *
   * Kept as a raw `string`, not a union: an unrecognised kind must survive
   * parsing so normalization can preserve the message instead of dropping it
   * (`03-modular-parsing.md` → Edge Cases).
   */
  readonly type: string;
  /** Which payload this fragment carries; drives per-kind field validation. */
  readonly category: DeepSeekFragmentCategory;
  /**
   * 0-based index of the `mapping` node (the "turn") this fragment came from.
   * Fragments of the same node share it.
   *
   * Kept because flattening loses node boundaries, and a `FILE` fragment has no
   * role of its own — it belongs to whoever sent the message it was attached to.
   * Recording the grouping lets normalization read that from the export instead of
   * guessing from neighbouring fragments (`ai-workflow-rules.md` §3).
   */
  readonly turnIndex: number;

  /** Text body. Present for `category === 'text'` (and only proven critical there). */
  readonly content?: string;
  /** Attached files. Present for `category === 'attachment'`. */
  readonly files?: readonly DeepSeekRawFile[];
  /**
   * Raw `results` payload, passed through **unmodified**.
   *
   * `unknown` on purpose: `SEARCH`/`TOOL_SEARCH` may carry it, `TOOL_OPEN`/
   * `TOOL_FIND` never do, and its inner shape is undocumented — reshaping it here
   * would be interpretation, which FR1 keeps out of `parse()`.
   */
  readonly results?: unknown;
  /** Per-message model, e.g. `deepseek-chat`. Absent in some nodes. */
  readonly model?: string;
  /** Verbatim timestamp string; never parsed into a `Date` here. */
  readonly insertedAt?: string;
}

/** One conversation from the export, already flattened into reading order. */
export interface DeepSeekRawConversation {
  readonly id: string;
  readonly title?: string;
  readonly insertedAt?: string;
  readonly updatedAt?: string;
  /**
   * Fragments in conversation order, obtained by walking `mapping` from `root`
   * via `children` — *not* by sorting on `inserted_at`.
   *
   * Why: in the real fixture each RESPONSE's `inserted_at` precedes the REQUEST
   * it answers (…:36.682 vs …:36.688), so a timestamp sort inverts every pair.
   * The graph is the only trustworthy order (ADR #4).
   */
  readonly fragments: readonly DeepSeekRawFragment[];
}

/** All conversations in one DeepSeek export file. */
export interface DeepSeekRawData extends ProviderRawData {
  readonly providerId: 'deepseek';
  /** A single export file can contain many conversations (2 in the fixture). */
  readonly conversations: readonly DeepSeekRawConversation[];
}

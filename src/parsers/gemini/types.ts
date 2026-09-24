import type { ProviderRawData } from '@/types/providers';

/**
 * Gemini **Provider Raw Data** — the output of `parse()` and the only input
 * `normalization/gemini.ts` accepts.
 *
 * Why a provider-specific shape instead of `UnifiedConversation`: Unit 03 FR1
 * keeps parsing structural. `parse()` proves the export's shape, groups the flat
 * Activity items into conversations and puts each conversation's turns in
 * reading order (ascending `time`); deciding what a "role", a "title" or a
 * "draft" means in the unified model is normalization's job (FR3/NFR3).
 *
 * Derived strictly from a census of the real local export
 * (`context/fixtures/gemini/README.md`) — never from an assumed format
 * (`ai-workflow-rules.md` §3). The census attests 23 Activity items forming
 * 7 conversations, in **reverse-chronological** file order, each item carrying
 * all of `header`, `title`, `time`, `products`, `details`,
 * `activityControls`, `safeHtmlItem` — plus, on some items, `subtitles`,
 * `imageFile` and `attachedFiles`.
 *
 * Fields the census does not prove are optional rather than assumed.
 */

/**
 * One Activity item, still carrying Gemini's own vocabulary — i.e. **one turn**
 * of a conversation (one user message plus the model's answer), not a whole
 * conversation (ADR #24 decision 3).
 */
export interface GeminiRawTurn {
  /**
   * Verbatim `time` (ISO-8601 UTC, e.g. `2026-08-30T07:57:42.183Z`).
   *
   * The turn's ONLY timestamp: the export records no separate time for the
   * model's answer and no conversation-level dates at all (ADR #26). Optional
   * because ordering — not this field — is what the format guarantees.
   */
  readonly time?: string;

  /**
   * Verbatim `title` — the user's message, **still carrying the export's own
   * `"درخواست: "` prefix**.
   *
   * The prefix is a constant of this export, and stripping it is a statement
   * about the *user's* text, so it happens in `normalization/gemini.ts` (FR4),
   * not here. The census attests 23/23 items carrying the prefix and none
   * carrying an empty title.
   */
  readonly title: string;

  /**
   * `safeHtmlItem[].html`, in export array order — the model's answer(s),
   * **pre-rendered HTML**, never Markdown.
   *
   * More than one entry means the platform recorded several drafts of the same
   * turn (1 of the 23 real items has two, 24 drafts in total). Empty when the
   * item carried none: the answer is missing, not fabricated (NFR1).
   */
  readonly drafts: readonly string[];

  /**
   * Verbatim file names from `attachedFiles` (empty when absent) — the binary
   * is **not** in this export, so a name is all there is (FR8).
   */
  readonly attachedFiles: readonly string[];

  /**
   * Verbatim `imageFile` — the image the **user uploaded**, when the item
   * carried one.
   *
   * Attested twice, and it is the export's only structural signal that
   * distinguishes the two attachment situations: present → an uploaded file
   * (`subtitles` reads «۱ فایل پیوست شد.»); absent while `attachedFiles` is
   * present → an image the **model produced** (`subtitles` reads
   * «۱ تصویر تولید شد.», spec EC4). Recording the field verbatim here is what
   * lets normalization decide the owner of the files without guessing.
   */
  readonly imageFile?: string;
}

/**
 * One conversation, rebuilt from the Activity items that share its URL.
 *
 * The export has no conversation object at all: `details[0].url` (whose `name`
 * is byte-identical to it) is the only thing tying items together (ADR #24
 * decision 2).
 */
export interface GeminiRawConversation {
  /**
   * The conversation id taken from `details[0].url` — its final path segment
   * (`https://gemini.google.com/app/<id>` → `<id>`), or the whole url when the
   * value has no path at all (defensive fallback, never an error).
   */
  readonly id: string;
  /** Turns in **ascending** `time` order (the file's own order is descending). */
  readonly turns: readonly GeminiRawTurn[];
}

/** All conversations in one Gemini export file. */
export interface GeminiRawData extends ProviderRawData {
  readonly providerId: 'gemini';
  /** A single export file can contain many conversations (7 in the real one). */
  readonly conversations: readonly GeminiRawConversation[];
}

/**
 * Gemini (Google Takeout «My Activity») export signature.
 *
 * Derived strictly from a census of the real local export
 * (`context/fixtures/gemini/README.md`) — never from an assumed format
 * (`ai-workflow-rules.md` §3).
 *
 * Observed shape: a top-level **array** of Activity items in
 * reverse-chronological order, each carrying all of `header`, `title`, `time`,
 * `products`, `details`, `activityControls`, `safeHtmlItem` (23/23 items).
 *
 * Why these deciding fields: this export is not a native chat export — each
 * element is a single *activity turn*, not a conversation. The trio
 * `title` + `details[]` + `safeHtmlItem[]` is what makes an item this format:
 * `details[0].url` is the only conversation key the format has, and
 * `safeHtmlItem[].html` is its own pre-rendered answer payload. DeepSeek's
 * signature (an array of `mapping` graphs) and Claude's (an array of
 * `chat_messages` + `account`) claim the "array of complete conversations"
 * family; neither carries an Activity item, so the three signatures are
 * mutually exclusive (ADR #24 decision 1).
 *
 * The match is conjunctive and **every** element must match, mirroring
 * `parsers/claude/detect.ts` and `parsers/deepseek/detect.ts`: a partial match
 * would mean the file is not a Gemini export, so it must not be claimed.
 *
 * `header` / `products` / `activityControls` and every field inside
 * `details[]` / `subtitles[]` are deliberately NOT read: they carry no usable
 * information (FR9, ADR #24 decision 7).
 *
 * This module intentionally imports nothing from other parsers (Invariant #3).
 */
export function detect(rawJson: unknown): boolean {
  if (!Array.isArray(rawJson) || rawJson.length === 0) {
    return false;
  }

  return rawJson.every(isGeminiActivityItem);
}

function isGeminiActivityItem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.title !== 'string') {
    return false;
  }

  // `details[0].url` is the conversation key: without it no turn can be placed
  // in a conversation, so an item missing it is not a Gemini activity item.
  if (!Array.isArray(value.details)) {
    return false;
  }
  const [firstDetail] = value.details;
  if (!isRecord(firstDetail) || typeof firstDetail.url !== 'string') {
    return false;
  }

  // The answer payload. An item whose `safeHtmlItem` is empty or unreadable
  // proves nothing about the format (mirrors Claude's empty `chat_messages`
  // rule), so at least one readable draft is required — and every entry must be
  // readable, not just one.
  const drafts = value.safeHtmlItem;
  return (
    Array.isArray(drafts) &&
    drafts.length > 0 &&
    drafts.every((draft) => isRecord(draft) && typeof draft.html === 'string')
  );
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
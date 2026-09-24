/**
 * ChatGPT export signature.
 *
 * **Provisional** (spec 11 → ADR-A): no real ChatGPT export exists yet, so this
 * signature is derived from the spec's cross-checked research plus the
 * owner-supplied sample — never from an assumed format
 * (`ai-workflow-rules.md` §3).
 *
 * Observed shape: a top-level **array** of conversations, each carrying
 * `mapping` — an object of nodes whose `message` has `author.role` and
 * `content.content_type` — plus `current_node`.
 *
 * Why `author.role` + `content.content_type` are the deciding fields: a
 * `mapping` graph alone is not unique to ChatGPT (DeepSeek nests its messages
 * under `mapping` too), but DeepSeek stores `message.fragments` instead, and
 * that difference is what separates the two families. The extra `fragments`
 * clause below makes the separation explicit in both directions.
 *
 * Deliberately **looser than DeepSeek/Claude/Gemini**: only *at least one*
 * element has to match, because a single damaged conversation must not make a
 * whole real export undetectable (FR-1/FR-3, ADR-F). Damaged elements are
 * skipped and recorded at parse time.
 *
 * The `fragments` clause is evaluated **across the whole file**, not only
 * inside the matched element: a DeepSeek export carries `fragments` on every
 * message, and a file mixing the two vocabularies is not a ChatGPT export this
 * unit is willing to claim.
 *
 * This module intentionally imports nothing from other parsers (Invariant #3).
 */
export function detect(rawJson: unknown): boolean {
  if (!Array.isArray(rawJson) || rawJson.length === 0) {
    return false;
  }

  let hasChatGptMessage = false;

  for (const element of rawJson) {
    // A non-object element is skipped rather than rejected: FR-3 counts such
    // entries and continues, so detection must tolerate them too.
    if (!isRecord(element)) {
      continue;
    }

    const mapping = element.mapping;
    if (!isRecord(mapping)) {
      continue;
    }

    for (const node of Object.values(mapping)) {
      if (!isRecord(node) || !isRecord(node.message)) {
        continue;
      }

      // DeepSeek's marker. A file carrying it anywhere is never claimed here,
      // whatever else its nodes look like.
      if (node.message.fragments !== undefined) {
        return false;
      }

      if (isChatGptMessage(node.message)) {
        hasChatGptMessage = true;
      }
    }
  }

  return hasChatGptMessage;
}

/** True when a `message` object carries ChatGPT's own two vocabulary fields. */
function isChatGptMessage(message: Record<string, unknown>): boolean {
  const { author, content } = message;
  if (!isRecord(author) || typeof author.role !== 'string') {
    return false;
  }
  // Structure only — the value is not interpreted, only required to be a string
  // (the same rule the other detectors apply to their deciding fields).
  return isRecord(content) && typeof content.content_type === 'string';
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

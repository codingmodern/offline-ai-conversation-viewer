/**
 * DeepSeek export signature.
 *
 * Derived strictly from the real (anonymized) export in
 * `tests/fixtures/deepseek/sample-real.json` — never from an assumed format
 * (`ai-workflow-rules.md` §3).
 *
 * Observed shape: a top-level **array** of conversations, each with `mapping`,
 * an object of nodes whose `message` (when present) carries `fragments[]` with a
 * `type` of `REQUEST` / `RESPONSE`.
 *
 * Why `fragments` + `REQUEST`/`RESPONSE` are the deciding fields: a `mapping`
 * graph alone is not unique to DeepSeek (ChatGPT's export also nests messages
 * under `mapping`), but it stores `author.role` / `content.parts` instead of
 * `fragments`. Keying on the fragment vocabulary keeps this signature specific
 * enough to avoid the ambiguous-detection path once other providers are added.
 *
 * This module intentionally imports nothing from other parsers (Invariant #3).
 */

/** Fragment kinds seen in DeepSeek exports; one is enough to identify the format. */
const FRAGMENT_TYPES: readonly string[] = ['REQUEST', 'RESPONSE'];

export function detect(rawJson: unknown): boolean {
  if (!Array.isArray(rawJson) || rawJson.length === 0) {
    return false;
  }

  // Every element must look like a DeepSeek conversation: a partial match would
  // mean the file is not a DeepSeek export, so it must not be claimed.
  return rawJson.every(isDeepSeekConversation);
}

function isDeepSeekConversation(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.mapping)) {
    return false;
  }

  const nodes = Object.values(value.mapping);
  if (nodes.length === 0) {
    return false;
  }

  // `mapping` always contains a `root` node whose `message` is null, so a valid
  // export is only confirmed by at least one *real* message with fragments.
  return nodes.every(isMappingNode) && nodes.some(hasDeepSeekFragment);
}

function isMappingNode(node: unknown): boolean {
  if (!isRecord(node)) {
    return false;
  }
  // A node either carries no message (structural node) or a message object.
  return node.message === null || node.message === undefined || isRecord(node.message);
}

function hasDeepSeekFragment(node: unknown): boolean {
  if (!isRecord(node) || !isRecord(node.message)) {
    return false;
  }

  const { fragments } = node.message;
  if (!Array.isArray(fragments)) {
    return false;
  }

  return fragments.some(
    (fragment) =>
      isRecord(fragment) &&
      typeof fragment.type === 'string' &&
      FRAGMENT_TYPES.includes(fragment.type),
  );
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

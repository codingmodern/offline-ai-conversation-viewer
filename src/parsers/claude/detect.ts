/**
 * Claude export signature.
 *
 * Derived strictly from a census of the real local export
 * (`context/fixtures/claude/README.md`) — never from an assumed format
 * (`ai-workflow-rules.md` §3).
 *
 * Observed shape: a top-level **array** of conversations, each carrying all of
 * `chat_messages` (array), `account`, `summary`, `name`, `uuid`,
 * `created_at`, `updated_at`. Every message has `uuid`, `sender`,
 * `content` (array), `created_at`, `updated_at`, `parent_message_uuid`, `text`,
 * `attachments`, `files`.
 *
 * Why these deciding fields: a top-level array of message lists is not unique
 * to Claude, and DeepSeek's signature (a top-level array of `mapping` graphs)
 * already claims that family. The pair `chat_messages` + `account` is attested
 * on all 29 real conversations and is Claude's own vocabulary, so the match is
 * conjunctive — `spec 09` §3 (matching its documented detection clause) — and
 * every element must match, mirroring `parsers/deepseek/detect.ts`.
 *
 * Message-level checks stay conjunctive-but-cheap: every message must have a
 * string `sender`, and at least one message somewhere must carry a
 * string-typed `parent_message_uuid` plus an array `content` — exactly what
 * the census proves universal (2005/2005).
 *
 * This module intentionally imports nothing from other parsers (Invariant #3).
 */
export function detect(rawJson: unknown): boolean {
  if (!Array.isArray(rawJson) || rawJson.length === 0) {
    return false;
  }

  // Every element must look like a Claude conversation: a partial match would
  // mean the file is not a Claude export, so it must not be claimed.
  return rawJson.every(isClaudeConversation);
}

function isClaudeConversation(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  // `account` is the discriminating vocabulary: ChatGPT exports also keep an
  // array of messages, but not this key. Checked on every conversation.
  if (!isRecord(value.account) || !Array.isArray(value.chat_messages)) {
    return false;
  }

  const messages = value.chat_messages;
  if (messages.length === 0) {
    return false;
  }

  // A partial message match would mean the file is not a Claude export, so it
  // must not be claimed: every message needs the two always-present keys, and
  // the linkage key must be attested at least once (an export of only
  // structural placeholders proves nothing).
  return (
    messages.every(isClaudeMessage) &&
    messages.some(
      (message) =>
        typeof message.parent_message_uuid === 'string' &&
        Array.isArray(message.content),
    )
  );
}

function isClaudeMessage(value: unknown): boolean {
  return isRecord(value) && typeof value.sender === 'string';
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

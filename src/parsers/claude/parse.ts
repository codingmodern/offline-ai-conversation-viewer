import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';
import type {
  ClaudeRawConversation,
  ClaudeRawData,
  ClaudeRawFile,
  ClaudeRawFragment,
  ClaudeRawMessage,
} from '@/parsers/claude/types';

/**
 * Claude `parse()`: validated JSON → `ClaudeRawData`.
 *
 * Scope boundary (`03-modular-parsing.md` FR1): this module proves the export's
 * structure and flattens the `parent_message_uuid` tree into reading order. It
 * never produces `UnifiedConversation` and never decides what a role or a
 * summary means — that is `normalization/claude.ts`'s job (FR3).
 *
 * Every failure is a typed `ParseError` (FR6): `MissingFieldError` when a
 * required field is absent, `UnexpectedTypeError` when it exists with the wrong
 * JSON type. Nothing is thrown, so one bad file can never break the pipeline.
 *
 * This module imports nothing from other parsers (Invariant #3).
 */
export function parse(rawJson: unknown): ParseResult<ClaudeRawData> {
  if (!Array.isArray(rawJson)) {
    return parseFailure('UnexpectedTypeError', 'Root value is not an array of conversations.');
  }
  if (rawJson.length === 0) {
    return parseFailure('MissingFieldError', 'Export contains no conversations.');
  }

  const conversations: ClaudeRawConversation[] = [];

  for (const [index, entry] of rawJson.entries()) {
    const conversation = parseConversation(entry, `conversations[${String(index)}]`);
    // Abort on the first bad conversation: a partially readable export would
    // silently hide missing messages, which is worse than a clear failure.
    if (!conversation.ok) {
      return conversation;
    }
    conversations.push(conversation.data);
  }

  return parseSuccess({ providerId: 'claude', conversations });
}

/**
 * The export's own root sentinel: the first message of every attested
 * conversation points its `parent_message_uuid` at this zero GUID rather than
 * at `null` (29/29 conversations in the census).
 */
const ROOT_SENTINEL = '00000000-0000-4000-8000-000000000000';

/** Internal parse shape: a message plus the parent link its ordering needs. */
interface PositionedMessage {
  readonly message: ClaudeRawMessage;
  /** Normalized parent key: `null` for the root sentinel or a missing link. */
  readonly parentKey: string | null;
}

function parseConversation(value: unknown, path: string): ParseResult<ClaudeRawConversation> {
  if (!isRecord(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an object.`);
  }

  const id = requireString(value.uuid, `${path}.uuid`);
  if (!id.ok) {
    return id;
  }

  const chatMessages = value.chat_messages;
  if (chatMessages === undefined) {
    return parseFailure('MissingFieldError', `${path}.chat_messages is absent.`);
  }
  if (!Array.isArray(chatMessages)) {
    return parseFailure('UnexpectedTypeError', `${path}.chat_messages is not an array.`);
  }

  const positioned: PositionedMessage[] = [];
  for (const [index, entry] of chatMessages.entries()) {
    const message = parseMessage(entry, `${path}.chat_messages[${String(index)}]`);
    if (!message.ok) {
      return message;
    }
    positioned.push(message.data);
  }

  const ordered = orderMessages(positioned, path);
  if (!ordered.ok) {
    return ordered;
  }

  const title = optionalString(value.name, `${path}.name`);
  if (!title.ok) {
    return title;
  }
  const summary = optionalString(value.summary, `${path}.summary`);
  if (!summary.ok) {
    return summary;
  }
  const createdAt = optionalString(value.created_at, `${path}.created_at`);
  if (!createdAt.ok) {
    return createdAt;
  }
  const updatedAt = optionalString(value.updated_at, `${path}.updated_at`);
  if (!updatedAt.ok) {
    return updatedAt;
  }

  // `exactOptionalPropertyTypes`: absent metadata is omitted, never `undefined`.
  return parseSuccess({
    id: id.data,
    ...(title.data === undefined ? {} : { title: title.data }),
    ...(summary.data === undefined ? {} : { summary: summary.data }),
    ...(createdAt.data === undefined ? {} : { createdAt: createdAt.data }),
    ...(updatedAt.data === undefined ? {} : { updatedAt: updatedAt.data }),
    messages: ordered.data,
  });
}

function parseMessage(value: unknown, path: string): ParseResult<PositionedMessage> {
  if (!isRecord(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an object.`);
  }

  const id = requireString(value.uuid, `${path}.uuid`);
  if (!id.ok) {
    return id;
  }
  const sender = requireString(value.sender, `${path}.sender`);
  if (!sender.ok) {
    return sender;
  }

  // The parent link decides tree position. The census proves the root child
  // points at the zero-GUID sentinel rather than `null`; both normalize to the
  // same root key. A link to a uuid the file never defines is tolerated as a
  // root rather than failing the whole export (matching DeepSeek's tolerance
  // for a parentless graph) — real exports never contain one.
  let parentKey: string | null = null;
  const parent = value.parent_message_uuid;
  if (parent !== undefined && parent !== null) {
    if (typeof parent !== 'string') {
      return parseFailure(
        'UnexpectedTypeError',
        `${path}.parent_message_uuid is ${typeof parent}, expected string.`,
      );
    }
    parentKey = parent === '' || parent === ROOT_SENTINEL ? null : parent;
  }

  const text = optionalString(value.text, `${path}.text`);
  if (!text.ok) {
    return text;
  }
  const createdAt = optionalString(value.created_at, `${path}.created_at`);
  if (!createdAt.ok) {
    return createdAt;
  }
  const updatedAt = optionalString(value.updated_at, `${path}.updated_at`);
  if (!updatedAt.ok) {
    return updatedAt;
  }

  const content = value.content;
  if (content !== undefined && content !== null && !Array.isArray(content)) {
    return parseFailure('UnexpectedTypeError', `${path}.content is not an array.`);
  }
  const fragments: ClaudeRawFragment[] = [];
  if (Array.isArray(content)) {
    for (const [index, entry] of content.entries()) {
      const fragment = parseFragment(entry, `${path}.content[${String(index)}]`);
      if (!fragment.ok) {
        return fragment;
      }
      fragments.push(fragment.data);
    }
  }

  const files = parseFiles(value.files, `${path}.files`);
  if (!files.ok) {
    return files;
  }

  // `attachments` was an empty array on all 2005 attested messages, so there is
  // no proven entry shape to carry forward — only its array-ness is validated.
  if (value.attachments !== undefined && value.attachments !== null && !Array.isArray(value.attachments)) {
    return parseFailure('UnexpectedTypeError', `${path}.attachments is not an array.`);
  }

  const message: ClaudeRawMessage = {
    id: id.data,
    sender: sender.data,
    ...(createdAt.data === undefined ? {} : { createdAt: createdAt.data }),
    ...(updatedAt.data === undefined ? {} : { updatedAt: updatedAt.data }),
    ...(text.data === undefined || text.data === '' ? {} : { text: text.data }),
    fragments,
    files: files.data,
  };
  return parseSuccess({ message, parentKey });
}

/**
 * Flattens the `parent_message_uuid` tree into reading order.
 *
 * The export stores *every* branch of every regenerate/edit, and array order
 * mixes dead siblings into the flow (the census proves array order is not even
 * chronological). The live conversation is exactly one child per node: the
 * **last** child in array order (ADR #22). Branches hanging off *skipped*
 * siblings are deliberately excluded — that is what "last child at every
 * branch point" means; in the real export some skipped branches even carry
 * whole subtrees of their own (7 attested), which the walk intentionally
 * never visits.
 *
 * What is NOT tolerated — because rendering a truncated conversation is worse
 * than failing loudly — is graph corruption:
 *   - two messages sharing one `uuid` (the walk could never be trusted),
 *   - a `parent_message_uuid` pointing at a message the file does not define,
 *   - a cycle in the parent graph (the walk would never terminate).
 * Each is a typed `UnsupportedFormatError`, mirroring DeepSeek's rule that a
 * partially readable export must fail clearly instead of silently hiding data.
 */
function orderMessages(
  messages: readonly PositionedMessage[],
  path: string,
): ParseResult<readonly ClaudeRawMessage[]> {
  const byId = new Map<string, PositionedMessage>();
  const childrenOf = new Map<string | null, PositionedMessage[]>();
  for (const entry of messages) {
    if (byId.has(entry.message.id)) {
      return parseFailure(
        'UnsupportedFormatError',
        `${path}: message uuid ${entry.message.id} appears more than once.`,
      );
    }
    byId.set(entry.message.id, entry);
    const siblings = childrenOf.get(entry.parentKey);
    if (siblings === undefined) {
      childrenOf.set(entry.parentKey, [entry]);
    } else {
      siblings.push(entry);
    }
  }

  // Every parent link must resolve inside this conversation. (The sentinel
  // root was already normalized to `null`, which needs no target.)
  for (const entry of messages) {
    if (entry.parentKey !== null && !byId.has(entry.parentKey)) {
      return parseFailure(
        'UnsupportedFormatError',
        `${path}: message ${entry.message.id} references a parent_message_uuid (${entry.parentKey}) that does not exist.`,
      );
    }
  }

  // Every message must be reachable from the sentinel root through *any*
  // child chain — dead siblings pass (they hang off live nodes), but an
  // unreachable island (which is what every cycle looks like, since a cycle
  // node's parent is always another cycle node) would mean silently losing
  // messages the export claims to contain.
  const reachable = new Set<string | null>([null]);
  const queue: Array<string | null> = [null];
  while (queue.length > 0) {
    const current = queue.pop() ?? null;
    for (const child of childrenOf.get(current) ?? []) {
      if (!reachable.has(child.message.id)) {
        reachable.add(child.message.id);
        queue.push(child.message.id);
      }
    }
  }
  if (reachable.size - 1 !== messages.length) {
    return parseFailure(
      'UnsupportedFormatError',
      `${path}: ${String(messages.length - (reachable.size - 1))} of ${String(messages.length)} messages are unreachable from the root message tree.`,
    );
  }

  // The live line: from the sentinel root, always the last child (ADR #22).
  // The reachability check above proves the graph is an acyclic tree, so this
  // walk terminates.
  const ordered: ClaudeRawMessage[] = [];
  let parent: string | null = null;
  while (true) {
    const siblings = childrenOf.get(parent);
    if (siblings === undefined) {
      break;
    }
    // `noUncheckedIndexedAccess`: a key only exists once a child was pushed,
    // so the list cannot be empty — the guard keeps the compiler honest.
    const chosen = siblings[siblings.length - 1];
    if (chosen === undefined) {
      break;
    }
    ordered.push(chosen.message);
    parent = chosen.message.id;
  }

  return parseSuccess(ordered);
}

/**
 * One entry of a message's `content` array.
 *
 * A type absent from the attested table is *not* an error: it is kept verbatim
 * in `sourceFragment` and falls to normalization's preserve-instead-of-drop
 * path (ADR #6's rule, applied to Claude's vocabulary).
 */
function parseFragment(value: unknown, path: string): ParseResult<ClaudeRawFragment> {
  if (!isRecord(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an object.`);
  }
  const type = requireString(value.type, `${path}.type`);
  if (!type.ok) {
    return type;
  }

  switch (type.data) {
    case 'text': {
      const text = requireString(value.text, `${path}.text`);
      return text.ok ? parseSuccess({ type: type.data, text: text.data }) : text;
    }
    case 'thinking': {
      // `thinking` and `summaries` ride along on every attested thinking
      // fragment, but blank bodies (hidden fragments) and absent arrays are
      // proven, so both stay optional — only the type is critical.
      const thinking = optionalString(value.thinking, `${path}.thinking`);
      if (!thinking.ok) {
        return thinking;
      }
      const summaries = value.summaries;
      if (summaries !== undefined && summaries !== null && !Array.isArray(summaries)) {
        return parseFailure('UnexpectedTypeError', `${path}.summaries is not an array.`);
      }
      let thinkingSummary: string | undefined;
      if (Array.isArray(summaries) && summaries.length > 0) {
        const first = summaries[0];
        if (!isRecord(first)) {
          return parseFailure('UnexpectedTypeError', `${path}.summaries[0] is not an object.`);
        }
        const summaryText = optionalString(first.summary, `${path}.summaries[0].summary`);
        if (!summaryText.ok) {
          return summaryText;
        }
        thinkingSummary = summaryText.data;
      }
      const hidden = value.thinking_hidden;
      if (hidden !== undefined && hidden !== null && typeof hidden !== 'boolean') {
        return parseFailure(
          'UnexpectedTypeError',
          `${path}.thinking_hidden is ${typeof hidden}, expected boolean.`,
        );
      }
      return parseSuccess({
        type: type.data,
        ...(thinking.data === undefined ? {} : { thinking: thinking.data }),
        ...(hidden === true ? { thinkingHidden: true } : {}),
        ...(thinkingSummary === undefined ? {} : { thinkingSummary }),
      });
    }

    case 'tool_use': {
      const toolId = requireString(value.id, `${path}.id`);
      if (!toolId.ok) {
        return toolId;
      }
      const toolName = optionalString(value.name, `${path}.name`);
      if (!toolName.ok) {
        return toolName;
      }
      // `input` is any JSON (objects attested, up to ~16 KB); absence and null
      // both mean "none" and are omitted rather than fabricated.
      const toolInput = value.input;
      return parseSuccess({
        type: type.data,
        toolId: toolId.data,
        ...(toolName.data === undefined ? {} : { toolName: toolName.data }),
        ...(toolInput === undefined || toolInput === null ? {} : { toolInput }),
      });
    }
    case 'tool_result': {
      const toolUseId = requireString(value.tool_use_id, `${path}.tool_use_id`);
      if (!toolUseId.ok) {
        return toolUseId;
      }
      const toolName = optionalString(value.name, `${path}.name`);
      if (!toolName.ok) {
        return toolName;
      }
      if (value.is_error !== undefined && value.is_error !== null && typeof value.is_error !== 'boolean') {
        return parseFailure(
          'UnexpectedTypeError',
          `${path}.is_error is ${typeof value.is_error}, expected boolean.`,
        );
      }
      return parseSuccess({
        type: type.data,
        toolUseId: toolUseId.data,
        ...(toolName.data === undefined ? {} : { toolName: toolName.data }),
        // `content` (an array of typed blocks) is carried verbatim — any value.
        ...(value.content === undefined || value.content === null ? {} : { toolOutput: value.content }),
        ...(value.is_error === true ? { toolIsError: true } : {}),
      });
    }
    default:
      // Unrecognised type: keep the whole fragment verbatim so normalization
      // can preserve the message instead of dropping it (Edge Cases rule).
      return parseSuccess({ type: type.data, sourceFragment: value });
  }
}

/**
 * A message's `files` array.
 *
 * Optional (only some messages carry files); every entry must carry the two
 * keys the real export uses — `file_uuid`, `file_name` — so nothing is
 * invented. `file_name` may be an empty string and is kept verbatim.
 */
function parseFiles(value: unknown, path: string): ParseResult<readonly ClaudeRawFile[]> {
  if (value === undefined || value === null) {
    return parseSuccess([]);
  }
  if (!Array.isArray(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an array.`);
  }

  const files: ClaudeRawFile[] = [];
  for (const [index, entry] of value.entries()) {
    const filePath = `${path}[${String(index)}]`;
    if (!isRecord(entry)) {
      return parseFailure('UnexpectedTypeError', `${filePath} is not an object.`);
    }
    const fileId = requireString(entry.file_uuid, `${filePath}.file_uuid`);
    if (!fileId.ok) {
      return fileId;
    }
    const fileName = requireString(entry.file_name, `${filePath}.file_name`);
    if (!fileName.ok) {
      return fileName;
    }
    files.push({ fileId: fileId.data, fileName: fileName.data });
  }
  return parseSuccess(files);
}

/** Required string: absent → `MissingFieldError`, wrong type → `UnexpectedTypeError`. */
function requireString(value: unknown, path: string): ParseResult<string> {
  if (value === undefined || value === null) {
    return parseFailure('MissingFieldError', `${path} is absent.`);
  }
  if (typeof value !== 'string') {
    return parseFailure('UnexpectedTypeError', `${path} is ${typeof value}, expected string.`);
  }
  return parseSuccess(value);
}

/**
 * Optional string. An absent value is fine (exports legitimately omit titles or
 * timestamps), but a *present* value of the wrong type means the format drifted
 * and is reported rather than silently discarded.
 */
function optionalString(value: unknown, path: string): ParseResult<string | undefined> {
  if (value === undefined || value === null) {
    return parseSuccess(undefined);
  }
  if (typeof value !== 'string') {
    return parseFailure('UnexpectedTypeError', `${path} is ${typeof value}, expected string.`);
  }
  return parseSuccess(value);
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}





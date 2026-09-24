import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';
import type {
  ChatGptRawAttachment,
  ChatGptRawConversation,
  ChatGptRawData,
  ChatGptRawMessage,
  ChatGptSkippedConversation,
} from '@/parsers/chatgpt/types';

/**
 * ChatGPT `parse()`: validated JSON → `ChatGptRawData`.
 *
 * Scope boundary (`03-modular-parsing.md` FR1): this module proves the export's
 * shape, resolves the **active branch** (FR-4) and flattens it into reading
 * order. It never produces `UnifiedConversation` and never decides what a role,
 * a content type or a citation marker means — that is
 * `normalization/chatgpt.ts`'s job (FR3).
 *
 * **Conversation isolation is deliberate** (FR-3, ADR-J): one damaged element
 * must not make a whole real export unreadable, so a conversation that cannot
 * be used is *skipped and recorded* in `skipped[]` instead of failing the file.
 * The one exception is the file as a whole — if **every** element is skipped,
 * the export is not a ChatGPT export this unit can read, and the existing loud
 * `UnsupportedFormatError` is returned (ADR-J).
 *
 * Graph tolerance differs from Claude's on purpose (spec 11 → Edge Cases): a
 * cycle or a dangling parent link terminates the walk and the partial thread is
 * kept, where Claude fails loudly (ADR #23). ChatGPT's export is undocumented
 * and unverified, so the spec prefers a best-effort thread here — the loud
 * failure stays at the file level, and nothing is ever invented to fill a gap.
 *
 * Every timing decision is structural: a message's own `create_time`, else the
 * nearest ancestor's, else nothing (FR-9). Nothing is written in the export's
 * place, and the unit stays seconds — normalization converts once (ADR-I).
 *
 * This module imports nothing from other parsers (Invariant #3).
 */
export function parse(rawJson: unknown): ParseResult<ChatGptRawData> {
  if (!Array.isArray(rawJson)) {
    return parseFailure('UnexpectedTypeError', 'Root value is not an array of conversations.');
  }
  if (rawJson.length === 0) {
    return parseFailure('MissingFieldError', 'Export contains no conversations.');
  }

  const conversations: ChatGptRawConversation[] = [];
  const skipped: ChatGptSkippedConversation[] = [];

  for (const [index, element] of rawJson.entries()) {
    const result = parseConversationElement(element, `conversations[${String(index)}]`);
    if (result.ok) {
      conversations.push(result.conversation);
      continue;
    }
    skipped.push(
      result.id === undefined
        ? { reason: result.reason }
        : { id: result.id, reason: result.reason },
    );
  }

  if (conversations.length === 0) {
    // ADR-J: skipping is a *narrow* exception to loud failure, and it never
    // extends to the file. A file whose every entry is unusable is rejected
    // with the existing error rather than importing as an empty batch.
    return parseFailure(
      'UnsupportedFormatError',
      `Every conversation was skipped (${String(skipped.length)} entries: ${skipped
        .map((entry) => entry.reason)
        .join('; ')}).`,
    );
  }

  return parseSuccess({ providerId: 'chatgpt', conversations, skipped });
}

/** A skipped element: the reason is always present, the id only when known. */
interface SkippedElement {
  readonly ok: false;
  readonly reason: string;
  readonly id?: string;
}

type ElementResult =
  | { readonly ok: true; readonly conversation: ChatGptRawConversation }
  | SkippedElement;

/** A `mapping` node, reduced to what ordering and message extraction need. */
interface MappedNode {
  /**
   * Node identity comes from the **mapping key**, not the node's own `id`:
   * `parent` / `children` link by that key, so it is the graph's own key space
   * (real exports set both to the same value). FR-9's "ids are opaque" applies:
   * nothing here assumes a format.
   */
  readonly parentId: string | null;
  /** Verbatim `children`, filtered to strings and kept in array order. */
  readonly childrenIds: readonly string[];
  /** The node's message when it has a usable one; absent for structural nodes. */
  readonly message?: Omit<ChatGptRawMessage, 'createTime'>;
  /** The message's own `create_time` (seconds), before ancestor fallback. */
  readonly ownTime?: number;
}

function parseConversationElement(value: unknown, path: string): ElementResult {
  if (!isRecord(value)) {
    return { ok: false, reason: `${path} is not an object.` };
  }

  const id = conversationId(value);
  if (id === undefined) {
    // Never fabricated: storage requires a non-empty `sourceConversationId`.
    return { ok: false, reason: 'missing id' };
  }

  const mapping = value.mapping;
  if (mapping === undefined || mapping === null) {
    return { ok: false, id, reason: 'missing mapping' };
  }
  if (!isRecord(mapping)) {
    return { ok: false, id, reason: 'mapping is not an object' };
  }

  const nodes = readNodes(mapping);
  if (nodes.size === 0) {
    return { ok: false, id, reason: 'empty mapping' };
  }

  const ordered = resolveBranch(nodes, currentNodeId(value));
  const messages = buildMessages(nodes, ordered);

  // Optional conversation metadata: a wrong-typed value is treated as absent
  // rather than costing the conversation (FR-3's isolation rule) — unlike the
  // required message fields, which do skip the message instead.
  const title = usableString(value.title);
  const createTime = usableNumber(value.create_time);
  const updateTime = usableNumber(value.update_time);
  const defaultModelSlug = usableString(value.default_model_slug);

  return {
    ok: true,
    conversation: {
      id,
      ...(title === undefined ? {} : { title }),
      ...(createTime === undefined ? {} : { createTime }),
      ...(updateTime === undefined ? {} : { updateTime }),
      ...(defaultModelSlug === undefined ? {} : { defaultModelSlug }),
      messages,
    },
  };
}

/**
 * The conversation's id: `id`, falling back to `conversation_id` (FR-9).
 *
 * Only a non-empty string is "usable"; anything else falls through to the next
 * candidate, and a conversation with neither is skipped by the caller.
 */
function conversationId(value: Record<string, unknown>): string | undefined {
  return usableString(value.id) ?? usableString(value.conversation_id);
}

/** `current_node` when it is a non-empty string; the branch walk decides if it resolves. */
function currentNodeId(value: Record<string, unknown>): string | undefined {
  return usableString(value.current_node);
}

/** `recipient` fallback: "addressed to a tool" is `recipient !== 'all'` (FR-6). */
const DEFAULT_RECIPIENT = 'all';

/** The parse shape of one message: the draft plus its own, unresolved time. */
interface ReadMessage {
  readonly message: Omit<ChatGptRawMessage, 'createTime'>;
  readonly ownTime?: number;
}

/**
 * Extracts one node's message, structurally.
 *
 * `undefined` when the node carries no usable message: a structural node
 * (`message: null`), a damaged message, or one missing `content`/`author`. The
 * spec's Validation table rules those "message skipped, conversation
 * continues" — one bad message never costs the whole conversation, and nothing
 * is invented to replace it.
 */
function readMessage(node: Record<string, unknown>): ReadMessage | undefined {
  const message = node.message;
  if (!isRecord(message)) {
    return undefined;
  }

  const author = message.author;
  if (!isRecord(author) || typeof author.role !== 'string' || author.role === '') {
    return undefined;
  }

  const content = message.content;
  if (!isRecord(content) || typeof content.content_type !== 'string') {
    return undefined;
  }

  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const messageId = usableString(message.id);
  const authorName = usableString(author.name);
  const channel = usableString(message.channel);
  const text = usableString(message.text);
  const contentText = usableString(content.text);
  const modelSlug = usableString(metadata.model_slug);
  const weight = usableNumber(message.weight);
  const ownTime = usableNumber(message.create_time);

  return {
    message: {
      ...(messageId === undefined ? {} : { id: messageId }),
      role: author.role,
      ...(authorName === undefined ? {} : { authorName }),
      recipient: usableString(message.recipient) ?? DEFAULT_RECIPIENT,
      contentType: content.content_type,
      ...(text === undefined ? {} : { text }),
      // FR-6's last named extraction source, read only by normalization.
      ...(contentText === undefined ? {} : { contentText }),
      // `parts` / `thoughts` stay verbatim and unflattened: FR-6's per-part
      // mapping (text, image pointer, placeholder) is normalization's job.
      parts: Array.isArray(content.parts) ? content.parts : [],
      thoughts: Array.isArray(content.thoughts) ? content.thoughts : [],
      ...(content.result === undefined ? {} : { result: content.result }),
      ...(channel === undefined ? {} : { channel }),
      ...(weight === undefined ? {} : { weight }),
      hiddenFromConversation: metadata.is_visually_hidden_from_conversation === true,
      ...(modelSlug === undefined ? {} : { modelSlug }),
      rawContent: content,
      attachments: readMetadataAttachments(metadata.attachments),
    },
    ...(ownTime === undefined ? {} : { ownTime }),
  };
}

/**
 * `metadata.attachments[]` reduced to the entries whose shape was recognised.
 *
 * No entry shape is attested, so recognition stays minimal and honest: an entry
 * needs an id or a name to become a `fileId` (the one field the unified
 * attachment requires); anything else is ignored silently (FR-8) instead of
 * being guessed at. Image pointers are **not** read here — they live inside
 * `parts` and are mapped by normalization, which keeps this list free of
 * duplicates.
 */
function readMetadataAttachments(value: unknown): readonly ChatGptRawAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: ChatGptRawAttachment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = usableString(entry.name);
    const fileId = usableString(entry.id) ?? name;
    if (fileId === undefined) {
      continue;
    }
    const fileSize = usableNumber(entry.size);
    attachments.push({
      fileId,
      ...(name === undefined ? {} : { fileName: name }),
      ...(fileSize === undefined ? {} : { fileSize }),
    });
  }

  return attachments;
}

/** Builds the node map, dropping entries that cannot participate in the graph. */
function readNodes(mapping: Record<string, unknown>): ReadonlyMap<string, MappedNode> {
  const nodes = new Map<string, MappedNode>();

  for (const [nodeId, rawNode] of Object.entries(mapping)) {
    if (!isRecord(rawNode)) {
      continue;
    }
    const read = readMessage(rawNode);
    nodes.set(nodeId, {
      parentId: usableString(rawNode.parent) ?? null,
      childrenIds: readStringArray(rawNode.children),
      ...(read === undefined ? {} : { message: read.message }),
      ...(read === undefined || read.ownTime === undefined ? {} : { ownTime: read.ownTime }),
    });
  }

  return nodes;
}

/**
 * The active branch's node ids, oldest first (FR-4).
 *
 * Three steps, each falling through when it yields nothing usable:
 *   1. the `current_node` path (the branch the user actually saw);
 *   2. the last-child line from the root(s) — the newest branch (ADR #22's rule
 *      in ChatGPT's vocabulary);
 *   3. every message, ordered by time (the "detached subtree / empty main
 *      thread" edge case).
 *
 * Node ids without a usable message are filtered out, so the result is exactly
 * the messages the thread shows.
 */
function resolveBranch(
  nodes: ReadonlyMap<string, MappedNode>,
  currentNode: string | undefined,
): readonly string[] {
  if (currentNode !== undefined && nodes.has(currentNode)) {
    const path = pathFromCurrent(nodes, currentNode);
    if (path !== null) {
      const withMessages = path.filter((nodeId) => hasMessage(nodes, nodeId));
      if (withMessages.length > 0) {
        return withMessages;
      }
    }
  }

  const line = lastChildLine(nodes);
  if (line.length > 0) {
    return line;
  }

  return timeOrdered(nodes);
}

/**
 * The `current_node` path back to the root, oldest first.
 *
 * `null` means "the path is broken" — a cycle was met — which sends the caller
 * to the FR-4 fallbacks rather than looping forever (spec → Edge Cases).
 *
 * A `parent` pointing at a node the file does not define counts as a root, and
 * so does a missing `parent`: both end the walk normally. The dangling link
 * itself is never treated as an error here (unlike Claude's loud rule, ADR
 * #23) because ChatGPT's format is unverified and the spec asks for a
 * best-effort thread.
 */
function pathFromCurrent(
  nodes: ReadonlyMap<string, MappedNode>,
  startId: string,
): readonly string[] | null {
  const visited = new Set<string>();
  const chain: string[] = [];
  let cursor: string | undefined = startId;

  // A `parent` pointing at an id the file never defines ends the walk as a
  // root (FR-4) — it is never pushed, so a phantom id cannot reach the thread.
  while (cursor !== undefined && nodes.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    chain.push(cursor);
    cursor = nodes.get(cursor)?.parentId ?? undefined;
  }

  // Stopping on an already-visited node means the chain loops, so it is not a
  // path from the root — let the fallbacks decide instead.
  if (cursor !== undefined && visited.has(cursor)) {
    return null;
  }

  chain.reverse();
  return chain;
}

/**
 * FR-4 fallback 1: from the root, the **last** child at each fork.
 *
 * A healthy export has exactly one root (`parent: null`, sometimes with a
 * structural node above the first message). A damaged one can leave several
 * nodes looking like roots — a dangling `parent` (FR-4 explicitly makes one a
 * root), a detached subtree — so each root's line is walked in mapping order
 * and appended: deterministic, and nothing is dropped. The shared `visited` set
 * terminates every cycle (spec → Edge Cases: "terminates; partial thread
 * shown").
 */
function lastChildLine(nodes: ReadonlyMap<string, MappedNode>): readonly string[] {
  const visited = new Set<string>();
  const line: string[] = [];

  for (const [nodeId, node] of nodes) {
    // A root is a node whose `parent` is missing *or* points at a node the file
    // never defines — both end the upward walk, so both must start the downward
    // one, or a detached subtree would silently lose its messages.
    if (node.parentId !== null && nodes.has(node.parentId)) {
      continue;
    }

    let cursor: string | undefined = nodeId;
    while (cursor !== undefined && !visited.has(cursor)) {
      visited.add(cursor);
      if (hasMessage(nodes, cursor)) {
        line.push(cursor);
      }
      cursor = lastChild(nodes, cursor);
    }
  }

  return line;
}

/** The last child the file actually defines, or `undefined` at a leaf. */
function lastChild(nodes: ReadonlyMap<string, MappedNode>, nodeId: string): string | undefined {
  const children = nodes.get(nodeId)?.childrenIds ?? [];

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const childId = children[index];
    if (childId !== undefined && nodes.has(childId)) {
      return childId;
    }
  }

  return undefined;
}

/** FR-4 fallback 2: every message ordered by its own time, undated ones last. */
function timeOrdered(nodes: ReadonlyMap<string, MappedNode>): readonly string[] {
  const ids: string[] = [];
  for (const [nodeId, node] of nodes) {
    if (node.message !== undefined) {
      ids.push(nodeId);
    }
  }

  // `Array.prototype.sort` is stable, so messages that share a time (or carry
  // none at all) keep the export's own mapping order.
  return ids.sort((a, b) => compareTimes(nodes.get(a)?.ownTime, nodes.get(b)?.ownTime));
}

/** Orders two verbatim second values; "no time" sorts last, never first. */
function compareTimes(a: number | undefined, b: number | undefined): number {
  const left = a ?? Number.POSITIVE_INFINITY;
  const right = b ?? Number.POSITIVE_INFINITY;
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * Assembles the ordered messages and resolves each one's time (FR-9).
 *
 * The id list is filtered again rather than trusted: a node could have lost its
 * message between resolution and assembly only if the graph were mutated, which
 * it never is — but the guard keeps the compiler honest under
 * `noUncheckedIndexedAccess` and states the invariant explicitly.
 */
function buildMessages(
  nodes: ReadonlyMap<string, MappedNode>,
  ordered: readonly string[],
): readonly ChatGptRawMessage[] {
  const messages: ChatGptRawMessage[] = [];
  // FR-9 inherits "down" the resolved thread (not up the raw graph), so the
  // cheapest correct read is one pass: each node's own time, if any, becomes
  // the inherited time for every message that follows it on the thread.
  let inherited: number | undefined;

  for (const nodeId of ordered) {
    const node = nodes.get(nodeId);
    const ownTime = node?.ownTime;
    if (ownTime !== undefined) {
      inherited = ownTime;
    }
    const message = node?.message;
    if (message === undefined) {
      continue;
    }
    // FR-9 + FR-4: only emit "displayed" messages (exclude system, hidden,
    // zero-weight, and context messages), but keep their times in the chain.
    if (isDisplayedMessage(message)) {
      messages.push(inherited === undefined ? message : { ...message, createTime: inherited });
    }
  }

  return messages;
}

/** True for messages that should appear in the conversation view (FR-4). */
function isDisplayedMessage(message: ChatGptRawMessage): boolean {
  // System messages are never displayed.
  if (message.role === 'system') {
    return false;
  }
  // Visually hidden messages are not displayed.
  if (message.hiddenFromConversation === true) {
    return false;
  }
  // Zero-weight messages are not displayed.
  if (message.weight === 0) {
    return false;
  }
  // Context messages (user_editable_context, model_editable_context) are not displayed.
  if (message.contentType === 'user_editable_context' || message.contentType === 'model_editable_context') {
    return false;
  }
  return true;
}

/** True when a node is part of the thread (it carries a usable message). */
function hasMessage(nodes: ReadonlyMap<string, MappedNode>, nodeId: string): boolean {
  return nodes.get(nodeId)?.message !== undefined;
}

/** A non-empty string, or `undefined` — an empty string is treated as absent. */
function usableString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A finite number, or `undefined` (`NaN`/`Infinity` are format drift, not values). */
function usableNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A `children`-like array reduced to its string entries, order preserved. */
function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

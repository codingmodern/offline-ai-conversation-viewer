import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';
import type {
  DeepSeekFragmentCategory,
  DeepSeekRawConversation,
  DeepSeekRawData,
  DeepSeekRawFile,
  DeepSeekRawFragment,
} from '@/parsers/deepseek/types';

/**
 * DeepSeek `parse()`: validated JSON → `DeepSeekRawData`.
 *
 * Scope boundary (`03-modular-parsing.md` FR1): this module proves the export's
 * structure and flattens the `mapping` graph into reading order. It never
 * produces `UnifiedConversation` and never decides what a role means — that is
 * `normalization/deepseek.ts`'s job (FR3).
 *
 * Every failure is a typed `ParseError` (FR6): `MissingFieldError` when a
 * required field is absent, `UnexpectedTypeError` when it exists with the wrong
 * JSON type. Nothing is thrown, so one bad file can never break the pipeline.
 *
 * This module imports nothing from other parsers (Invariant #3).
 */

/**
 * Which payload each attested fragment type carries.
 *
 * Why a table instead of "`content` is always required": a full census of a real
 * export (2026-08-20) found 8 types in 3 payload categories, and the original
 * fixture only proved 2 of them. Requiring `content` everywhere turned every
 * `FILE`/`SEARCH`/`TOOL_*` fragment into a `MissingFieldError` and blocked real
 * imports outright (`architecture.md` §7 → Edge Cases).
 *
 * A type absent from this table is *not* an error: it falls back to `text`, whose
 * fields are all optional, so an unrecognised fragment is preserved rather than
 * rejected (ADR #6).
 */
const FRAGMENT_CATEGORIES: Readonly<Record<string, DeepSeekFragmentCategory>> = {
  REQUEST: 'text',
  RESPONSE: 'text',
  THINK: 'text',
  FILE: 'attachment',
  SEARCH: 'toolActivity',
  TOOL_SEARCH: 'toolActivity',
  TOOL_OPEN: 'toolActivity',
  TOOL_FIND: 'toolActivity',
};

export function parse(rawJson: unknown): ParseResult<DeepSeekRawData> {
  if (!Array.isArray(rawJson)) {
    return parseFailure('UnexpectedTypeError', 'Root value is not an array of conversations.');
  }
  if (rawJson.length === 0) {
    return parseFailure('MissingFieldError', 'Export contains no conversations.');
  }

  const conversations: DeepSeekRawConversation[] = [];

  for (const [index, entry] of rawJson.entries()) {
    const conversation = parseConversation(entry, `conversations[${String(index)}]`);
    // Abort on the first bad conversation: a partially readable export would
    // silently hide missing messages, which is worse than a clear failure.
    if (!conversation.ok) {
      return conversation;
    }
    conversations.push(conversation.data);
  }

  return parseSuccess({ providerId: 'deepseek', conversations });
}

function parseConversation(value: unknown, path: string): ParseResult<DeepSeekRawConversation> {
  if (!isRecord(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an object.`);
  }

  const id = requireString(value.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }

  const mapping = value.mapping;
  if (mapping === undefined) {
    return parseFailure('MissingFieldError', `${path}.mapping is absent.`);
  }
  if (!isRecord(mapping)) {
    return parseFailure('UnexpectedTypeError', `${path}.mapping is not an object.`);
  }

  const fragments = collectFragments(mapping, `${path}.mapping`);
  if (!fragments.ok) {
    return fragments;
  }

  const title = optionalString(value.title, `${path}.title`);
  if (!title.ok) {
    return title;
  }
  const insertedAt = optionalString(value.inserted_at, `${path}.inserted_at`);
  if (!insertedAt.ok) {
    return insertedAt;
  }
  const updatedAt = optionalString(value.updated_at, `${path}.updated_at`);
  if (!updatedAt.ok) {
    return updatedAt;
  }

  // `exactOptionalPropertyTypes` forbids assigning `undefined`, so absent
  // metadata is *omitted* rather than set to `undefined`.
  return parseSuccess({
    id: id.data,
    ...(title.data === undefined ? {} : { title: title.data }),
    ...(insertedAt.data === undefined ? {} : { insertedAt: insertedAt.data }),
    ...(updatedAt.data === undefined ? {} : { updatedAt: updatedAt.data }),
    fragments: fragments.data,
  });
}

/**
 * Walks `mapping` depth-first along `children`, starting from the graph's entry
 * points.
 *
 * Why graph order and not `inserted_at`: in the real fixture every RESPONSE is
 * stamped a few milliseconds *before* the REQUEST it answers, so sorting by
 * timestamp would invert every exchange. The parent/child links are the only
 * trustworthy ordering (ADR #3).
 *
 * Iterative (explicit stack) rather than recursive so a very long conversation
 * cannot overflow the call stack on a large export (NFR2).
 */
function collectFragments(
  mapping: Record<string, unknown>,
  path: string,
): ParseResult<readonly DeepSeekRawFragment[]> {
  const entryPoints = findEntryPoints(mapping, path);
  if (!entryPoints.ok) {
    return entryPoints;
  }

  const fragments: DeepSeekRawFragment[] = [];
  // Reversed so the first entry point is processed first once popped.
  const stack: string[] = [...entryPoints.data].reverse();
  // A malformed export could contain a cycle; visiting each node once keeps the
  // walk finite without rejecting the file.
  const visited = new Set<string>();
  // Counts message-bearing nodes only, so structural nodes (`message: null`) do
  // not leave gaps in the turn numbering.
  let turnIndex = 0;

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (nodeId === undefined || visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    const node = mapping[nodeId];
    const nodePath = `${path}.${nodeId}`;
    if (!isRecord(node)) {
      return parseFailure('UnexpectedTypeError', `${nodePath} is not an object.`);
    }

    const nodeFragments = readNodeFragments(node, nodePath, turnIndex);
    if (!nodeFragments.ok) {
      return nodeFragments;
    }
    if (nodeFragments.data.length > 0) {
      fragments.push(...nodeFragments.data);
      turnIndex += 1;
    }

    const children = node.children;
    if (children === undefined || children === null) {
      continue;
    }
    if (!Array.isArray(children)) {
      return parseFailure('UnexpectedTypeError', `${nodePath}.children is not an array.`);
    }
    // Reversed so the first child is processed first once popped. Branches
    // (regenerated answers) are therefore flattened depth-first — every message
    // is preserved rather than a branch being silently dropped.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (typeof childId !== 'string') {
        return parseFailure(
          'UnexpectedTypeError',
          `${nodePath}.children contains a non-string id.`,
        );
      }
      // A dangling id points at a node that does not exist, so there is no
      // message to lose by skipping it.
      if (childId in mapping) {
        stack.push(childId);
      }
    }
  }

  return parseSuccess(fragments);
}

/**
 * Finds the nodes the walk should start from.
 *
 * `root` is used when present, as in the real fixture. Otherwise the entry points
 * are the nodes that no other node lists as a child, in declaration order.
 *
 * Why not simply require a literal `root` key: `detect()` claims a file on the
 * presence of `mapping` plus the fragment vocabulary alone, so demanding `root`
 * here would let a *detected* file fail to parse — the gap Invariant #2 forbids.
 * A node set with no entry point at all (every node is someone's child, i.e. a
 * pure cycle) is a genuine structural failure and is reported as one.
 */
function findEntryPoints(
  mapping: Record<string, unknown>,
  path: string,
): ParseResult<readonly string[]> {
  const nodeIds = Object.keys(mapping);
  if (nodeIds.length === 0) {
    return parseFailure('MissingFieldError', `${path} contains no nodes.`);
  }
  if ('root' in mapping) {
    return parseSuccess(['root']);
  }

  const claimed = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = mapping[nodeId];
    if (!isRecord(node)) {
      continue;
    }
    const children = node.children;
    if (!Array.isArray(children)) {
      continue;
    }
    for (const childId of children) {
      if (typeof childId === 'string') {
        claimed.add(childId);
      }
    }
  }

  const entryPoints = nodeIds.filter((nodeId) => !claimed.has(nodeId));
  if (entryPoints.length === 0) {
    return parseFailure('MissingFieldError', `${path} has no root node to start from.`);
  }
  return parseSuccess(entryPoints);
}

/** Reads one node's fragments. Structural nodes (`message: null`) yield none. */
function readNodeFragments(
  node: Record<string, unknown>,
  path: string,
  turnIndex: number,
): ParseResult<readonly DeepSeekRawFragment[]> {
  const message = node.message;
  if (message === null || message === undefined) {
    return parseSuccess([]);
  }
  if (!isRecord(message)) {
    return parseFailure('UnexpectedTypeError', `${path}.message is not an object.`);
  }

  const rawFragments = message.fragments;
  if (rawFragments === undefined) {
    return parseFailure('MissingFieldError', `${path}.message.fragments is absent.`);
  }
  if (!Array.isArray(rawFragments)) {
    return parseFailure('UnexpectedTypeError', `${path}.message.fragments is not an array.`);
  }

  const model = optionalString(message.model, `${path}.message.model`);
  if (!model.ok) {
    return model;
  }
  const insertedAt = optionalString(message.inserted_at, `${path}.message.inserted_at`);
  if (!insertedAt.ok) {
    return insertedAt;
  }

  const fragments: DeepSeekRawFragment[] = [];

  for (const [index, entry] of rawFragments.entries()) {
    const fragmentPath = `${path}.message.fragments[${String(index)}]`;
    if (!isRecord(entry)) {
      return parseFailure('UnexpectedTypeError', `${fragmentPath} is not an object.`);
    }

    const type = requireString(entry.type, `${fragmentPath}.type`);
    if (!type.ok) {
      return type;
    }

    const payload = readFragmentPayload(entry, type.data, fragmentPath);
    if (!payload.ok) {
      return payload;
    }

    // Model/timestamp live on the *message*, so every fragment of a multi-part
    // message inherits them — no value is invented here.
    fragments.push({
      type: type.data,
      turnIndex,
      ...payload.data,
      ...(model.data === undefined ? {} : { model: model.data }),
      ...(insertedAt.data === undefined ? {} : { insertedAt: insertedAt.data }),
    });
  }

  return parseSuccess(fragments);
}

/** The payload half of a fragment: its category plus whichever field that category carries. */
type FragmentPayload = Omit<DeepSeekRawFragment, 'type' | 'model' | 'insertedAt' | 'turnIndex'>;

/**
 * Validates a fragment's payload according to its *category*, not a single global
 * rule.
 *
 * This is the fix for the real bug: `content` used to be required for every
 * fragment, so a `FILE`/`SEARCH`/`TOOL_OPEN` fragment — which legitimately has no
 * `content` — failed with `MissingFieldError` and rejected the entire export.
 * Criticality is now per-category:
 *
 * | category      | critical field | notes |
 * |---------------|----------------|-------|
 * | `text`        | `content`      | as before |
 * | `attachment`  | `files`        | `content` is absent by design |
 * | `toolActivity`| none           | `results` may be present or not; absence is not an error |
 *
 * Only *structural* validation happens here; which role or unified `kind` a type
 * maps to stays in `normalization/` (FR1).
 */
function readFragmentPayload(
  entry: Record<string, unknown>,
  type: string,
  path: string,
): ParseResult<FragmentPayload> {
  // Casing is not a documented guarantee, so the lookup is case-insensitive —
  // matching how normalization reads the same `type`.
  const category = FRAGMENT_CATEGORIES[type.toUpperCase()];

  if (category === 'attachment') {
    const files = requireFiles(entry.files, `${path}.files`);
    if (!files.ok) {
      return files;
    }
    return parseSuccess({ category, files: files.data });
  }

  if (category === 'toolActivity') {
    // `results` is never critical: SEARCH/TOOL_SEARCH may carry it, TOOL_OPEN and
    // TOOL_FIND never do. When present it is passed through untouched — shaping it
    // would be interpretation, which belongs outside `parse()`.
    return parseSuccess(
      'results' in entry && entry.results !== undefined
        ? { category, results: entry.results }
        : { category },
    );
  }

  // `text` — including any type missing from the table, whose content is then
  // optional so the fragment survives instead of failing the file (ADR #6).
  if (category === undefined) {
    const content = optionalString(entry.content, `${path}.content`);
    if (!content.ok) {
      return content;
    }
    return parseSuccess(
      content.data === undefined
        ? { category: 'text' }
        : { category: 'text', content: content.data },
    );
  }

  const content = requireString(entry.content, `${path}.content`);
  if (!content.ok) {
    return content;
  }
  return parseSuccess({ category, content: content.data });
}

/**
 * A `FILE` fragment's `files` array.
 *
 * Required (it is this category's only payload), and every entry must carry the
 * three keys the real export uses — `file_id`, `file_name`, `file_size` — so no
 * attachment is ever surfaced with a fabricated empty name or zero size. All
 * entries are read, not just the first: nothing proves a fragment cannot carry
 * several files.
 */
function requireFiles(value: unknown, path: string): ParseResult<readonly DeepSeekRawFile[]> {
  if (value === undefined || value === null) {
    return parseFailure('MissingFieldError', `${path} is absent.`);
  }
  if (!Array.isArray(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an array.`);
  }

  const files: DeepSeekRawFile[] = [];

  for (const [index, entry] of value.entries()) {
    const filePath = `${path}[${String(index)}]`;
    if (!isRecord(entry)) {
      return parseFailure('UnexpectedTypeError', `${filePath} is not an object.`);
    }

    const fileId = requireString(entry.file_id, `${filePath}.file_id`);
    if (!fileId.ok) {
      return fileId;
    }
    const fileName = requireString(entry.file_name, `${filePath}.file_name`);
    if (!fileName.ok) {
      return fileName;
    }
    const fileSize = requireNumber(entry.file_size, `${filePath}.file_size`);
    if (!fileSize.ok) {
      return fileSize;
    }

    files.push({ fileId: fileId.data, fileName: fileName.data, fileSize: fileSize.data });
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
 * Required finite number.
 *
 * `NaN`/`Infinity` are rejected as `UnexpectedTypeError`: a file size that cannot
 * be displayed is format drift, and passing it through would surface a nonsense
 * value in the UI rather than a clear failure.
 */
function requireNumber(value: unknown, path: string): ParseResult<number> {
  if (value === undefined || value === null) {
    return parseFailure('MissingFieldError', `${path} is absent.`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return parseFailure(
      'UnexpectedTypeError',
      `${path} is ${typeof value}, expected a finite number.`,
    );
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

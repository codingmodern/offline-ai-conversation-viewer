import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';
import type {
  GeminiRawConversation,
  GeminiRawData,
  GeminiRawTurn,
} from '@/parsers/gemini/types';

/**
 * Gemini `parse()`: validated JSON → `GeminiRawData`.
 *
 * Scope boundary (`03-modular-parsing.md` FR1): this module proves the export's
 * structure, groups the flat Activity items into conversations (by
 * `details[0].url`) and re-orders everything **ascending** by `time`, because
 * the file itself is reverse-chronological (FR2/FR3, ADR #24 decision 2). It
 * never produces `UnifiedConversation` and never decides what a role, a title or
 * a draft means — that is `normalization/gemini.ts`'s job (FR3).
 *
 * Two ordering rules, both documented and both tested:
 *   - turns inside a conversation, and conversations among themselves, ascend by
 *     `time`;
 *   - a value the export did not timestamp (or that `Date.parse` cannot read)
 *     cannot be placed on the timeline, so it keeps its own file position
 *     *after* every dated item (`Array.prototype.sort` is stable). Nothing is
 *     invented for it and nothing is dropped.
 *
 * Every failure is a typed `ParseError` (FR6): `MissingFieldError` when a field
 * the census attests universally is absent, `UnexpectedTypeError` when it exists
 * with the wrong JSON type. Nothing is thrown, so one bad file can never break
 * the pipeline — and the first malformed item aborts the whole file, because a
 * half-readable export would silently hide turns (the same ruling as Claude's
 * ADR #23 / DeepSeek's loud-failure rule).
 *
 * This module imports nothing from other parsers (Invariant #3).
 */
export function parse(rawJson: unknown): ParseResult<GeminiRawData> {
  if (!Array.isArray(rawJson)) {
    return parseFailure('UnexpectedTypeError', 'Root value is not an array of Activity items.');
  }
  if (rawJson.length === 0) {
    return parseFailure('MissingFieldError', 'Export contains no activity items.');
  }

  // Grouping key: the export's own `details[0].url`. A `Map` keeps first-seen
  // order, which is the stable fallback for turns that carry no timestamp.
  const groups = new Map<string, { readonly id: string; readonly turns: GeminiRawTurn[] }>();

  for (const [index, entry] of rawJson.entries()) {
    const path = `items[${String(index)}]`;

    if (!isRecord(entry)) {
      return parseFailure('UnexpectedTypeError', `${path} is not an object.`);
    }

    const url = readConversationUrl(entry, path);
    if (!url.ok) {
      return url;
    }

    const turn = parseTurn(entry, path);
    if (!turn.ok) {
      return turn;
    }

    const group = groups.get(url.data) ?? { id: toConversationId(url.data), turns: [] };
    group.turns.push(turn.data);
    groups.set(url.data, group);
  }

  const conversations: GeminiRawConversation[] = [...groups.values()].map((group) => ({
    id: group.id,
    turns: sortByTime(group.turns),
  }));

  return parseSuccess({ providerId: 'gemini', conversations: sortConversations(conversations) });
}

/** One Activity item → one raw turn (structural fields only). */
function parseTurn(item: Record<string, unknown>, path: string): ParseResult<GeminiRawTurn> {
  const title = requireString(item.title, `${path}.title`);
  if (!title.ok) {
    return title;
  }

  const time = optionalString(item.time, `${path}.time`);
  if (!time.ok) {
    return time;
  }

  const drafts = readDrafts(item.safeHtmlItem, `${path}.safeHtmlItem`);
  if (!drafts.ok) {
    return drafts;
  }

  const attachedFiles = readFileNames(item.attachedFiles, `${path}.attachedFiles`);
  if (!attachedFiles.ok) {
    return attachedFiles;
  }

  const imageFile = optionalString(item.imageFile, `${path}.imageFile`);
  if (!imageFile.ok) {
    return imageFile;
  }

  // `exactOptionalPropertyTypes`: an absent value is omitted, never `undefined`.
  return parseSuccess({
    title: title.data,
    drafts: drafts.data,
    attachedFiles: attachedFiles.data,
    ...(time.data === undefined ? {} : { time: time.data }),
    ...(imageFile.data === undefined ? {} : { imageFile: imageFile.data }),
  });
}

/**
 * The conversation key of an item: `details[0].url`.
 *
 * The census attests exactly one `details` entry per item, shaped
 * `{ name, url }` with `name` byte-identical to `url`. `name` is deliberately
 * ignored (ADR #24 decision 7) — reading a duplicate would add a second source
 * of truth for the same value.
 */
function readConversationUrl(item: Record<string, unknown>, path: string): ParseResult<string> {
  const { details } = item;
  if (details === undefined || details === null) {
    return parseFailure('MissingFieldError', `${path}.details is absent.`);
  }
  if (!Array.isArray(details)) {
    return parseFailure('UnexpectedTypeError', `${path}.details is not an array.`);
  }
  if (details.length === 0) {
    return parseFailure('MissingFieldError', `${path}.details is empty.`);
  }

  const [firstDetail] = details;
  if (!isRecord(firstDetail)) {
    return parseFailure('UnexpectedTypeError', `${path}.details[0] is not an object.`);
  }
  return requireString(firstDetail.url, `${path}.details[0].url`);
}

/**
 * `safeHtmlItem` → the turn's answer drafts, in export order.
 *
 * Present on every attested item, but treated as optional here so a missing or
 * empty list degrades to "no answer recorded" instead of failing the import
 * (NFR1). A *present* entry of the wrong shape is format drift and is reported.
 */
function readDrafts(value: unknown, path: string): ParseResult<readonly string[]> {
  if (value === undefined || value === null) {
    return parseSuccess([]);
  }
  if (!Array.isArray(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an array.`);
  }

  const drafts: string[] = [];
  for (const [index, entry] of value.entries()) {
    const draftPath = `${path}[${String(index)}]`;
    if (!isRecord(entry)) {
      return parseFailure('UnexpectedTypeError', `${draftPath} is not an object.`);
    }
    const html = requireString(entry.html, `${draftPath}.html`);
    if (!html.ok) {
      return html;
    }
    drafts.push(html.data);
  }
  return parseSuccess(drafts);
}

/** `attachedFiles` → verbatim file names (empty when the item carried none). */
function readFileNames(value: unknown, path: string): ParseResult<readonly string[]> {
  if (value === undefined || value === null) {
    return parseSuccess([]);
  }
  if (!Array.isArray(value)) {
    return parseFailure('UnexpectedTypeError', `${path} is not an array.`);
  }

  const names: string[] = [];
  for (const [index, entry] of value.entries()) {
    const name = requireString(entry, `${path}[${String(index)}]`);
    if (!name.ok) {
      return name;
    }
    names.push(name.data);
  }
  return parseSuccess(names);
}

/**
 * The conversation id inside `details[0].url` — its final path segment
 * (`…/app/47e071b39ec83828` → `47e071b39ec83828`).
 *
 * Grouping itself always uses the whole url, so two distinct urls can never be
 * merged; this only turns the surviving key into the id the unified model
 * stores. A url without a path keeps its own value rather than becoming an
 * empty id (defensive, never an error).
 */
function toConversationId(url: string): string {
  const lastSegment = url.slice(url.lastIndexOf('/') + 1);
  return lastSegment === '' ? url : lastSegment;
}

/** Turns ascending by `time`; undated (or unreadable) turns keep file order, last. */
function sortByTime(turns: readonly GeminiRawTurn[]): readonly GeminiRawTurn[] {
  return [...turns].sort((a, b) => compareTimes(a.time, b.time));
}

/**
 * Conversations ascending by their earliest turn time.
 *
 * Turns are already sorted, so the first *dated* turn carries the earliest
 * value. A conversation with no readable timestamp at all keeps its file
 * position after every dated one, exactly like an undated turn.
 */
function sortConversations(
  conversations: readonly GeminiRawConversation[],
): readonly GeminiRawConversation[] {
  return [...conversations].sort((a, b) => compareTimes(earliestTime(a), earliestTime(b)));
}

function earliestTime(conversation: GeminiRawConversation): string | undefined {
  return conversation.turns.find((turn) => turn.time !== undefined)?.time;
}

/**
 * Orders two verbatim timestamp strings.
 *
 * The census attests one homogeneous ISO-8601 UTC format on all 23 items, so the
 * values are compared by the instant they denote (not by string order, which
 * would break the moment an export mixed offsets). A value that cannot be read
 * is "no time" and sorts last; two equal keys keep their relative order because
 * `Array.prototype.sort` is stable.
 */
function compareTimes(a: string | undefined, b: string | undefined): number {
  const aKey = timeKey(a);
  const bKey = timeKey(b);
  if (aKey === bKey) {
    return 0;
  }
  return aKey < bKey ? -1 : 1;
}

/** Milliseconds since epoch for ordering only — the stored value stays verbatim. */
function timeKey(time: string | undefined): number {
  if (time === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
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
 * Optional string. An absent value is fine (a timestamp or image reference may
 * legitimately be missing), but a *present* value of the wrong type means the
 * format drifted and is reported rather than silently discarded.
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
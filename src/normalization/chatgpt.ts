import type {
  UnifiedAttachment,
  UnifiedConversation,
  UnifiedMessage,
  UnifiedRole,
  UnifiedToolActivity,
} from '@/types/conversation';
import type {
  ChatGptRawAttachment,
  ChatGptRawConversation,
  ChatGptRawData,
  ChatGptRawMessage,
} from '@/parsers/chatgpt/types';

/**
 * ChatGPT → `UnifiedConversation` mapping.
 *
 * Reads **only** `parse()`'s output (`ChatGptRawData`), never raw JSON
 * (`03-modular-parsing.md` NFR3). Shapes, branch resolution and time resolution
 * were already proven by the parser, so this layer maps vocabulary and cannot
 * fail — it never throws, whatever the raw data holds.
 *
 * This is where ChatGPT's own vocabulary becomes the unified one
 * (`architecture.md` §2 → Internal Module Contracts):
 *
 * | source                                        | kind            | role                    |
 * |-----------------------------------------------|-----------------|-------------------------|
 * | `text`, `multimodal_text`                     | `text`          | from the message role   |
 * | `thoughts`, `reasoning_recap`, commentary     | `text`          | `assistant`             |
 * | `code`, `execution_output`, `computer_output` | `tool_activity` | from the message role   |
 * | `tether_browsing_display`, `tether_quote`      | `tool_activity` | from the message role   |
 * | `tool` role, addressed to a tool              | `tool_activity` | `assistant`             |
 * | image pointer parts, metadata attachments     | `attachment`    | from the message role   |
 * | anything else                                 | `text` (no body)| from the message role   |
 *
 * Three rules deserve naming because they are decisions, not mechanics:
 *   - **FR-5 hiding** happens here, on the flags the parser surfaced: system
 *     messages, `weight: 0`, visually-hidden messages and the editable-context
 *     (custom instructions / memory) types never produce a message at all.
 *     A conversation whose every message is hidden still normalizes — with
 *     `messages: []` — so the library lists it instead of dropping it silently.
 *   - **FR-7 citation stripping** applies to displayed text only (never to a
 *     tool's input/output, which stay verbatim).
 *   - **ADR-I**: ChatGPT is the only provider whose export times are numbers,
 *     so this module performs the project's single non-verbatim time mapping —
 *     Unix seconds → ISO-8601 UTC — because every shared consumer reads
 *     timestamps with `Date.parse`.
 */

/**
 * FR-6/FR-8: the one label an attachment without a name gets (an image pointer
 * carries no name, and an unrecognised attachment entry is ignored entirely
 * rather than labelled). Exported so Unit 11b and the tests share one constant.
 */
export const CHATGPT_ATTACHMENT_PLACEHOLDER = 'فایل پیوست';

/** FR-6: the `content_type` an image part carries. */
const IMAGE_POINTER_TYPE = 'image_asset_pointer';

/** FR-6: the metadata key the non-pointer attachments arrive on. */
const ATTACHMENTS_SOURCE_KEY = 'attachments';

/** FR-5: never displayed — custom instructions and memory (ADR-D). */
const HIDDEN_CONTENT_TYPES: readonly string[] = [
  'user_editable_context',
  'model_editable_context',
];

/** FR-6: tool activity whose text is the *result* of the step. */
const TOOL_OUTPUT_TYPES: readonly string[] = [
  'execution_output',
  'computer_output',
  'tether_browsing_display',
  'tether_quote',
];

/** FR-7: a citation span wrapped in the private-use delimiters U+E200…U+E201. */
const CITATION_SPAN = /\uE200[\s\S]*?\uE201/g;

/** FR-7: the bracket form 【…】. `[^】]` keeps one marker from swallowing the next. */
const CITATION_BRACKET = /【[^】]*】/g;

/** Largest instant a JS `Date` can hold (±100,000,000 days, in ms). */
const MAX_DATE_MS = 8_640_000_000_000_000;

/** A unified message before its `order` is assigned (order is positional). */
type Draft = Omit<UnifiedMessage, 'order'>;

/** The fields every ChatGPT-derived message shares. */
type MessageBase = Pick<UnifiedMessage, 'role' | 'model'> & {
  readonly createdAt?: string;
};

export function normalizeChatGpt(raw: ChatGptRawData): readonly UnifiedConversation[] {
  return raw.conversations.map(toUnifiedConversation);
}

function toUnifiedConversation(conversation: ChatGptRawConversation): UnifiedConversation {
  const messages: UnifiedMessage[] = [];
  // FR-9's last message-time fallback: the conversation's own `create_time`.
  const conversationTime = toIsoTime(conversation.createTime);

  for (const message of conversation.messages) {
    appendMessage(messages, message, conversationTime);
  }

  const createdAt = toIsoTime(conversation.createTime);
  const updatedAt = toIsoTime(conversation.updateTime);

  // `exactOptionalPropertyTypes`: absent metadata is omitted, never `undefined`.
  // An empty or whitespace-only title is the same as no title (FR-9): keeping
  // it would surface the Sidebar's fallback label next to a title that never
  // existed, so it stays absent. A non-empty title stays byte-for-byte.
  const title =
    conversation.title === undefined || conversation.title.trim() === ''
      ? undefined
      : conversation.title;

  return {
    sourceProvider: 'chatgpt',
    sourceConversationId: conversation.id,
    ...(title === undefined ? {} : { title }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    messages,
  };
}

/** Appends every unified message one raw message produces, `order` included. */
function appendMessage(
  out: UnifiedMessage[],
  message: ChatGptRawMessage,
  conversationTime: string | undefined,
): void {
  for (const draft of toUnifiedMessages(message, conversationTime)) {
    out.push({ ...draft, order: out.length });
  }
}

/**
 * Expands one raw message into its unified messages, in source order (FR-6).
 *
 * An empty result means the message had nothing renderable left after FR-5's
 * filtering — it contributes no row rather than an empty one (spec → Edge
 * Cases: "empty" is never displayed, but is also never fabricated).
 */
function toUnifiedMessages(
  message: ChatGptRawMessage,
  conversationTime: string | undefined,
): readonly Draft[] {
  if (isHidden(message)) {
    return [];
  }

  const createdAt = toIsoTime(message.createTime) ?? conversationTime;
  const base: MessageBase = {
    role: toUnifiedRole(message.role),
    // FR-9: only the per-message slug is carried; the conversation's
    // `default_model_slug` is never aggregated onto messages (ADR #15).
    ...(message.modelSlug === undefined ? {} : { model: message.modelSlug }),
    ...(createdAt === undefined ? {} : { createdAt }),
  };

  switch (categorize(message)) {
    case 'reasoning':
      return reasoningMessages(message, base);
    case 'tool':
      return toolMessages(message, base);
    case 'unknown':
      return unknownMessages(message, base);
    default:
      return textMessages(message, base);
  }
}

/** FR-5: the messages that are never displayed. */
function isHidden(message: ChatGptRawMessage): boolean {
  if (message.role === 'system') {
    return true;
  }
  // `0` is a real exported weight (a message hidden from the visible thread),
  // so this is an equality check — `undefined` means "the export stated none".
  if (message.weight === 0) {
    return true;
  }
  if (message.hiddenFromConversation) {
    return true;
  }
  return HIDDEN_CONTENT_TYPES.includes(message.contentType);
}

/** FR-6: which of the four payload families a message belongs to. */
function categorize(message: ChatGptRawMessage): 'text' | 'reasoning' | 'tool' | 'unknown' {
  // The role rows of FR-6's table are decisive where they apply: a `tool`
  // message *is* tool traffic, and an assistant message addressed to something
  // other than `all` is an invocation — whatever its `content_type` says.
  if (message.role === 'tool') {
    return 'tool';
  }
  if (message.role === 'assistant' && message.recipient !== 'all') {
    return 'tool';
  }

  switch (message.contentType) {
    case 'text':
    case 'multimodal_text':
      return 'text';
    case 'thoughts':
    case 'reasoning_recap':
      return 'reasoning';
    case 'code':
    case 'execution_output':
    case 'computer_output':
    case 'tether_browsing_display':
    case 'tether_quote':
      return 'tool';
    default:
      return 'unknown';
  }
}

/**
 * `text` / `multimodal_text` (FR-6): the body first, then one placeholder per
 * unrecognised object part, then the message's attachments.
 *
 * `parts` is walked in order and never assumed to start with a string: a
 * multimodal message whose first part is an image would otherwise surface a
 * pointer as text.
 */
function textMessages(message: ChatGptRawMessage, base: MessageBase): readonly Draft[] {
  const drafts: Draft[] = [];
  const content = stripCitations(extractText(message));

  if (content !== '') {
    drafts.push({
      ...base,
      kind: 'text',
      content,
      sourceFragmentType: textSourceType(message),
    });
  }

  for (const part of message.parts) {
    const placeholder = toPlaceholder(part, message.contentType);
    if (placeholder !== null) {
      drafts.push({ ...base, ...placeholder });
    }
  }

  const attachment = toAttachmentMessage(message, base);
  if (attachment !== null) {
    drafts.push(attachment);
  }

  return drafts;
}

/**
 * `thoughts` / `reasoning_recap` (FR-6, ADR-G): assistant text with the export's
 * own type preserved in `sourceFragmentType`, exactly like DeepSeek's `THINK`.
 *
 * A reasoning message with nothing to show carries no body the export ever
 * wrote, so it is dropped rather than rendered as an empty block.
 */
function reasoningMessages(message: ChatGptRawMessage, base: MessageBase): readonly Draft[] {
  const drafts: Draft[] = [];
  const content = stripCitations(extractText(message));

  if (content !== '') {
    drafts.push({
      ...base,
      kind: 'text',
      content,
      sourceFragmentType: message.contentType,
    });
  }

  const attachment = toAttachmentMessage(message, base);
  if (attachment !== null) {
    drafts.push(attachment);
  }

  return drafts;
}

/**
 * Tool traffic (FR-6): always one activity row, so "an assistant message that is
 * only a tool call" shows as activity rather than as empty text.
 *
 * The row carries `activityType` (the verbatim content type) and its payload;
 * `toolName` comes from the author's name or the message's recipient.
 */
function toolMessages(message: ChatGptRawMessage, base: MessageBase): readonly Draft[] {
  const drafts: Draft[] = [
    {
      ...base,
      kind: 'tool_activity',
      // The verbatim content type, exactly like every other message keeps.
      sourceFragmentType: message.contentType,
      toolActivity: toToolActivity(message, extractText(message)),
    },
  ];

  const attachment = toAttachmentMessage(message, base);
  if (attachment !== null) {
    drafts.push(attachment);
  }

  return drafts;
}

/**
 * Anything else (FR-6's last row): a message with **no text**, its raw `content`
 * kept in `sourceFragment`, and its own type named in `sourceFragmentType` so a
 * renderer can show a placeholder that names it. Nothing is dropped.
 */
function unknownMessages(message: ChatGptRawMessage, base: MessageBase): readonly Draft[] {
  const drafts: Draft[] = [
    {
      ...base,
      kind: 'text',
      sourceFragmentType: message.contentType,
      sourceFragment: message.rawContent,
    },
  ];

  const attachment = toAttachmentMessage(message, base);
  if (attachment !== null) {
    drafts.push(attachment);
  }

  return drafts;
}

/**
 * One object `parts` entry that is neither text nor a recognised image pointer,
 * preserved as its own contentless message (FR-6).
 *
 * The part's own `content_type` names it when it has one; otherwise the
 * message's type is the best honest description available. The message's own
 * role applies (the caller adds it): a part never states who sent it.
 */
function toPlaceholder(
  part: unknown,
  fallbackType: string,
): Omit<Draft, 'role'> | null {
  if (typeof part === 'string' || readImagePointer(part) !== null) {
    return null;
  }

  return {
    kind: 'text',
    sourceFragmentType: readPartType(part) ?? fallbackType,
    sourceFragment: part,
  };
}

/** The message's attachments as ONE unified `attachment` message, or `null`. */
function toAttachmentMessage(message: ChatGptRawMessage, base: MessageBase): Draft | null {
  const attachments = collectAttachments(message);
  if (attachments.length === 0) {
    return null;
  }

  return {
    ...base,
    kind: 'attachment',
    attachments,
    // The key the entries arrived on, in the order they are collected: an image
    // pointer is part of the message body, a metadata attachment is metadata.
    sourceFragmentType: hasImagePointer(message) ? IMAGE_POINTER_TYPE : ATTACHMENTS_SOURCE_KEY,
  };
}

/**
 * The message's attachments, in source order: image-pointer parts first, then
 * the recognised `metadata.attachments` entries (FR-8).
 *
 * The two lists are kept as they are — a pointer is the model's own image
 * reference and a metadata entry is a file; the export attests no link between
 * them, so nothing is merged or removed on a guess.
 */
function collectAttachments(message: ChatGptRawMessage): readonly UnifiedAttachment[] {
  const attachments: UnifiedAttachment[] = [];

  for (const part of message.parts) {
    const pointer = readImagePointer(part);
    if (pointer !== null) {
      attachments.push(pointer);
    }
  }

  for (const attachment of message.attachments) {
    attachments.push(toUnifiedAttachment(attachment));
  }

  return attachments;
}

/** A recognised `image_asset_pointer` part as a unified attachment, or `null`. */
function readImagePointer(part: unknown): UnifiedAttachment | null {
  if (!isRecord(part) || part.content_type !== IMAGE_POINTER_TYPE) {
    return null;
  }

  const pointer = part.asset_pointer;
  // The pointer is the only identifier the export gives, and it is an internal
  // reference (`sediment://…`, `file-service://…`) that cannot be resolved
  // offline — so it becomes `fileId` and the name falls back to the shared
  // placeholder (FR-8). A pointer part without a usable pointer string is left
  // to the generic placeholder path instead of inventing an id.
  if (typeof pointer !== 'string' || pointer === '') {
    return null;
  }

  return { fileId: pointer, fileName: CHATGPT_ATTACHMENT_PLACEHOLDER };
}

/** A part's own `content_type`, when it states one. */
function readPartType(part: unknown): string | undefined {
  if (!isRecord(part)) {
    return undefined;
  }
  const type = part.content_type;
  return typeof type === 'string' && type !== '' ? type : undefined;
}

/** True when any part of the message is a recognised image pointer. */
function hasImagePointer(message: ChatGptRawMessage): boolean {
  return message.parts.some((part) => readImagePointer(part) !== null);
}

/**
 * A recognised `metadata.attachments` entry as a unified attachment.
 *
 * A size is carried only when the export stated one, and a missing name falls
 * back to the shared placeholder — the same name-only rule Gemini's attachments
 * follow.
 */
function toUnifiedAttachment(attachment: ChatGptRawAttachment): UnifiedAttachment {
  return {
    fileId: attachment.fileId,
    fileName: attachment.fileName ?? CHATGPT_ATTACHMENT_PLACEHOLDER,
    ...(attachment.fileSize === undefined ? {} : { fileSize: attachment.fileSize }),
  };
}

/**
 * Describes the tool step (FR-6).
 *
 * `activityType` is the verbatim content type. `toolName` is the author's own
 * name when it has one, else the recipient the message was addressed to —
 * `all` is not a tool, so it never becomes a name.
 */
function toToolActivity(message: ChatGptRawMessage, text: string): UnifiedToolActivity {
  const toolName =
    message.authorName ?? (message.recipient === 'all' ? undefined : message.recipient);

  return {
    activityType: message.contentType,
    ...toolPayload(message, text),
    ...(toolName === undefined ? {} : { toolName }),
  };
}

/**
 * Where the step's text belongs (FR-6): the invocation or its result.
 *
 * `code` is the invocation and the output types are results; when the content
 * type is indecisive the role decides — a `tool` message *is* the tool's own
 * output, while an assistant message addressed to a tool is the instruction
 * that invoked it. For any other role the vocabulary gives no direction, so
 * neither field is fabricated (the row still records that the step happened).
 */
function toolPayload(
  message: ChatGptRawMessage,
  text: string,
): { readonly toolInput?: string; readonly toolOutput?: string } {
  if (text === '') {
    return {};
  }
  if (message.contentType === 'code') {
    return { toolInput: text };
  }
  if (TOOL_OUTPUT_TYPES.includes(message.contentType)) {
    return { toolOutput: text };
  }
  if (message.role === 'tool') {
    return { toolOutput: text };
  }
  if (message.role === 'assistant') {
    return { toolInput: text };
  }
  return {};
}

/**
 * `sourceFragmentType` for a plain text message.
 *
 * Normally the verbatim `content_type`. The single exception is the spec's
 * **[Unverified]** commentary channel (FR-6): such a message's content type is
 * plain `text`, so keeping it verbatim would make the model's reasoning
 * indistinguishable from a final answer. `'commentary'` is the export's own
 * channel value, not an invented label, and 11b decides how to present it —
 * the same contract DeepSeek's `THINK` and Claude's `thinking` follow (ADR-G).
 */
function textSourceType(message: ChatGptRawMessage): string {
  if (message.role === 'assistant' && message.channel === 'commentary') {
    return message.channel;
  }
  return message.contentType;
}

/**
 * The message's text, in FR-6's documented order exactly: string `parts` →
 * the `text` mirror → `result` → `thoughts` → `content.text` → nothing.
 *
 * Each step names a different field, because the mirror (`message.text`) and
 * the content object (`content.text`) can disagree: some content types —
 * including the fixture's `reasoning_recap` and `code` — carry their body only
 * in the content object. Never `parts[0]`: a multimodal message's first part
 * can be an image pointer, and reading it blindly would turn an attachment
 * into text.
 */
function extractText(message: ChatGptRawMessage): string {
  const fromParts = joinStringParts(message.parts);
  if (fromParts !== '') {
    return fromParts;
  }
  if (message.text !== undefined) {
    return message.text;
  }
  const fromResult = readStringValue(message.result);
  if (fromResult !== undefined) {
    return fromResult;
  }
  const fromThoughts = readThoughts(message.thoughts);
  if (fromThoughts !== '') {
    return fromThoughts;
  }
  return message.contentText ?? '';
}

/**
 * The message's string parts, joined with newlines.
 *
 * A `parts` array holds one content block per entry, so a newline keeps two
 * blocks distinguishable instead of welding them together; in practice a text
 * message carries exactly one string part (the sample confirms it).
 */
function joinStringParts(parts: readonly unknown[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .trim();
}

/**
 * `thoughts` flattened into text.
 *
 * Each entry contributes its own `content` (the reasoning body) or, when the
 * body is absent, its `summary` — the export's own one-line replacement — and
 * a plain string entry is used as-is. Entries are joined with newlines so the
 * existing reasoning block's per-line step model (DeepSeek's `ThinkingBlock`,
 * which 11b reuses) can render them without a second schema.
 */
function readThoughts(thoughts: readonly unknown[]): string {
  const lines: string[] = [];

  for (const thought of thoughts) {
    if (typeof thought === 'string') {
      if (thought !== '') {
        lines.push(thought);
      }
      continue;
    }
    if (!isRecord(thought)) {
      continue;
    }
    const body = readStringValue(thought.content) ?? readStringValue(thought.summary);
    if (body !== undefined) {
      lines.push(body);
    }
  }

  return lines.join('\n').trim();
}

/** A non-empty string value, or `undefined` — everything else is not text. */
function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Maps ChatGPT's role vocabulary onto the unified one (FR-6): `user` → user;
 * `assistant` and `tool` → assistant (tool traffic is always assistant-side, as
 * in DeepSeek); any other stated role → `unknown`. Never guessed.
 */
function toUnifiedRole(role: string): UnifiedRole {
  switch (role) {
    case 'user':
      return 'user';
    case 'assistant':
    case 'tool':
      return 'assistant';
    default:
      return 'unknown';
  }
}

/**
 * FR-9 / ADR-I: the export's Unix seconds → an ISO-8601 UTC string.
 *
 * The project's first non-verbatim time mapping, and a deliberate one: ChatGPT
 * is the only provider whose export times are numbers, while every shared
 * consumer (`features/library/metadataFields.ts`, the themes' date chips) reads
 * a timestamp through `Date.parse`. A non-finite or out-of-range value is
 * omitted rather than clamped or thrown on — showing no date is honest, while a
 * fabricated instant would put the message on a timeline the export never
 * stated.
 */
function toIsoTime(seconds: number | undefined): string | undefined {
  if (seconds === undefined) {
    return undefined;
  }
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
    return undefined;
  }
  return new Date(ms).toISOString();
}

/**
 * FR-7: citation markers are removed from displayed text, never resolved.
 *
 * Two documented forms are dropped with their delimiters: a span wrapped in the
 * private-use delimiters U+E200…U+E201 (the `cite` / `filecite` / entity
 * markers) and the `【…】` bracket form. The spec records the bracket form as
 * unverified and notes that removing an entity marker can also remove a visible
 * name — an accepted v1 limitation, and the reason markers are stripped at all
 * rather than rendered raw (ADR-E).
 *
 * Only message text is cleaned: a tool's input/output stays verbatim.
 */
function stripCitations(text: string): string {
  return text.replace(CITATION_SPAN, '').replace(CITATION_BRACKET, '');
}

/** Narrows unknown JSON to a plain object (arrays and `null` excluded). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
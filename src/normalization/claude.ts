import type {
  UnifiedAttachment,
  UnifiedConversation,
  UnifiedMessage,
  UnifiedRole,
  UnifiedToolActivity,
} from '@/types/conversation';
import type {
  ClaudeRawConversation,
  ClaudeRawData,
  ClaudeRawFile,
  ClaudeRawFragment,
  ClaudeRawMessage,
} from '@/parsers/claude/types';

/**
 * Claude → `UnifiedConversation` mapping.
 *
 * Reads **only** `parse()`'s output (`ClaudeRawData`), never raw JSON
 * (`03-modular-parsing.md` NFR3). If a field is missing here, it was already
 * proven missing by the parser — so this layer contains no re-validation and
 * cannot fail.
 *
 * This is where Claude's fragment types become the unified vocabulary
 * (`architecture.md` §2 → Internal Module Contracts):
 *
 * | fragment        | kind            | role                    |
 * |-----------------|-----------------|-------------------------|
 * | `text`          | `text`          | from the message sender |
 * | `thinking`      | `text`          | `assistant` (sender)    |
 * | `tool_use`      | `tool_activity` | `assistant` (sender)    |
 * | `tool_result`   | `tool_activity` | `assistant` (sender)    |
 * | anything else   | `text`          | from the message sender |
 * | message `files` | `attachment`    | from the message sender |
 *
 * **One fragment = one message** (spec 09 → Normalization): Claude stores
 * reasoning and tool traffic as fragments of a *single* message, so flattening
 * them keeps every block independently addressable — the same shape DeepSeek's
 * fragment flattening produces — instead of hiding them inside one giant
 * assistant turn.
 *
 * Branching is already resolved by the parser's last-child walk (ADR #22);
 * this module maps the surviving live line 1:1.
 */
export function normalizeClaude(raw: ClaudeRawData): readonly UnifiedConversation[] {
  return raw.conversations.map(toUnifiedConversation);
}

function toUnifiedConversation(conversation: ClaudeRawConversation): UnifiedConversation {
  const messages: UnifiedMessage[] = [];
  for (const message of conversation.messages) {
    appendMessage(messages, message);
  }

  // `exactOptionalPropertyTypes`: absent metadata is omitted, never `undefined`.
  return {
    sourceProvider: 'claude',
    sourceConversationId: conversation.id,
    ...(conversation.title === undefined ? {} : { title: conversation.title }),
    // The export's own per-conversation summary, verbatim (27 of 29 non-empty).
    ...(conversation.summary === undefined ? {} : { summary: conversation.summary }),
    ...(conversation.createdAt === undefined ? {} : { createdAt: conversation.createdAt }),
    // `updatedAt` is the export's own conversation-level value, verbatim —
    // deliberately *not* recomputed from the newest message timestamp (ADR #8).
    ...(conversation.updatedAt === undefined ? {} : { updatedAt: conversation.updatedAt }),
    messages,
  };
}

/**
 * Expands one Claude message into its unified messages, in place.
 *
 * Claude bundles reasoning and tool traffic as fragments of a single message,
 * so one export message yields **several** unified messages (one per fragment,
 * 1 fragment = 1 message) plus a trailing attachment message when its own
 * `files` array carried entries. A message whose `content` array is empty
 * (7 attested) still becomes exactly one message, from its export-level
 * `text` mirror when that is non-empty.
 *
 * The `text` mirror of a message that *does* have fragments is ignored: the
 * fragments are the authoritative content and the mirror is derivative.
 */
function appendMessage(out: UnifiedMessage[], message: ClaudeRawMessage): void {
  const role = toUnifiedRole(message.sender);
  const timestamp =
    message.createdAt === undefined ? {} : { createdAt: message.createdAt };

  if (message.fragments.length === 0) {
    if (message.files.length > 0) {
      out.push({
        role,
        kind: 'attachment',
        attachments: message.files.map(toUnifiedAttachment),
        // Not a fragment of the export — the key the files arrived on.
        sourceFragmentType: 'files',
        order: out.length,
        ...timestamp,
      });
      return;
    }
    out.push({
      role,
      kind: 'text',
      ...(message.text === undefined ? {} : { content: message.text }),
      sourceFragmentType: 'text',
      order: out.length,
      ...timestamp,
    });
    return;
  }

  for (const fragment of message.fragments) {
    const unified = toFragmentMessage(fragment, role, message);
    // A reasoning fragment with nothing to show (hidden *and* summary-less) is
    // dropped entirely — exactly the case the spec's "hidden → drop" rule
    // covers. Everything else survives.
    if (unified !== null) {
      out.push({ ...unified, order: out.length });
    }
  }

  if (message.files.length > 0) {
    out.push({
      role,
      kind: 'attachment',
      attachments: message.files.map(toUnifiedAttachment),
      sourceFragmentType: 'files',
      order: out.length,
      ...timestamp,
    });
  }
}

function toFragmentMessage(
  fragment: ClaudeRawFragment,
  role: UnifiedRole,
  message: ClaudeRawMessage,
): Omit<UnifiedMessage, 'order'> | null {
  const common = {
    role,
    sourceFragmentType: fragment.type,
    ...(message.createdAt === undefined ? {} : { createdAt: message.createdAt }),
  };

  switch (fragment.type) {
    case 'text':
      return {
        ...common,
        kind: 'text',
        ...(fragment.text === undefined ? {} : { content: fragment.text }),
      };
    case 'thinking':
      return toThinkingMessage(common, fragment);
    case 'tool_use':
      return { ...common, kind: 'tool_activity', toolActivity: toToolActivity(fragment) };
    case 'tool_result':
      return { ...common, kind: 'tool_activity', toolActivity: toToolActivity(fragment) };
    default:
      // Unrecognised fragment: preserved verbatim, never dropped (ADR #6).
      return {
        ...common,
        kind: 'text',
        ...(fragment.sourceFragment === undefined ? {} : { sourceFragment: fragment.sourceFragment }),
      };
  }
}

/** The fields every fragment-derived message shares. */
type FragmentCommon = Pick<UnifiedMessage, 'role' | 'sourceFragmentType'> & {
  readonly createdAt?: string;
};

/**
 * Maps a `thinking` fragment onto a text message.
 *
 * Three attested variants (spec 09 → thinking handling):
 *   - visible body  → `content` is the verbatim reasoning text;
 *   - hidden + `summaries[0].summary` → `content` is the platform's own
 *     one-line replacement for the hidden body;
 *   - hidden with no summary → **dropped entirely** (`null`): the export proves
 *     the body is blank, and rendering an empty block would fabricate content.
 */
function toThinkingMessage(
  common: FragmentCommon,
  fragment: ClaudeRawFragment,
): Omit<UnifiedMessage, 'order'> | null {
  if (fragment.thinkingHidden === true) {
    if (fragment.thinkingSummary === undefined) {
      return null;
    }
    return { ...common, kind: 'text', content: fragment.thinkingSummary };
  }
  return {
    ...common,
    kind: 'text',
    ...(fragment.thinking === undefined ? {} : { content: fragment.thinking }),
  };
}

/**
 * Maps a tool fragment onto the unified tool activity.
 *
 * `tool_use` carries the invocation (`id` + `input`), `tool_result` the outcome
 * (`tool_use_id` + `content` + `is_error`). Everything stays verbatim: `input`
 * and `content` are arbitrary JSON whose inner shape is the tool's business,
 * not ours (same rule as DeepSeek's `results`, ADR #18).
 */
function toToolActivity(fragment: ClaudeRawFragment): UnifiedToolActivity {
  if (fragment.type === 'tool_use') {
    return {
      activityType: fragment.type,
      ...(fragment.toolId === undefined ? {} : { toolUseId: fragment.toolId }),
      ...(fragment.toolInput === undefined ? {} : { toolInput: fragment.toolInput }),
      ...(fragment.toolName === undefined ? {} : { toolName: fragment.toolName }),
    };
  }
  return {
    activityType: fragment.type,
    ...(fragment.toolUseId === undefined ? {} : { toolUseId: fragment.toolUseId }),
    ...(fragment.toolOutput === undefined ? {} : { toolOutput: fragment.toolOutput }),
    ...(fragment.toolName === undefined ? {} : { toolName: fragment.toolName }),
    ...(fragment.toolIsError === true ? { toolIsError: true } : {}),
  };
}

/**
 * Maps a `files` entry onto the unified attachment.
 *
 * No size is exported for Claude files (census), so `fileSize` stays absent
 * instead of being fabricated as zero — `AttachmentCard` renders the name only.
 */
function toUnifiedAttachment(file: ClaudeRawFile): UnifiedAttachment {
  return { fileId: file.fileId, fileName: file.fileName };
}

/**
 * Maps Claude's sender onto the unified role vocabulary.
 *
 * Only `human`/`assistant` are attested; anything else becomes `'unknown'`
 * rather than an error — dropping a message would lose user data (Edge Cases).
 */
function toUnifiedRole(sender: string): UnifiedRole {
  switch (sender) {
    case 'human':
      return 'user';
    case 'assistant':
      return 'assistant';
    default:
      return 'unknown';
  }
}




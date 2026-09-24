import type {
  UnifiedAttachment,
  UnifiedConversation,
  UnifiedMessage,
  UnifiedMessageKind,
  UnifiedRole,
  UnifiedToolActivity,
} from '@/types/conversation';
import type {
  DeepSeekRawConversation,
  DeepSeekRawData,
  DeepSeekRawFile,
  DeepSeekRawFragment,
} from '@/parsers/deepseek/types';

/**
 * DeepSeek → `UnifiedConversation` mapping.
 *
 * Reads **only** `parse()`'s output (`DeepSeekRawData`), never raw JSON
 * (`03-modular-parsing.md` NFR3). If a field is missing here, it was already
 * proven missing by the parser — so this layer contains no re-validation and
 * cannot fail.
 *
 * This is where DeepSeek's 8 fragment types become the unified vocabulary
 * (`architecture.md` §2 → Internal Module Contracts):
 *
 * | type          | kind            | role                    |
 * |---------------|-----------------|-------------------------|
 * | `REQUEST`     | `text`          | `user`                  |
 * | `RESPONSE`    | `text`          | `assistant`             |
 * | `THINK`       | `text`          | `assistant`             |
 * | `FILE`        | `attachment`    | inherited from its turn |
 * | `SEARCH`      | `tool_activity` | `assistant`             |
 * | `TOOL_SEARCH` | `tool_activity` | `assistant`             |
 * | `TOOL_OPEN`   | `tool_activity` | `assistant`             |
 * | `TOOL_FIND`   | `tool_activity` | `assistant`             |
 *
 * `THINK` is deliberately *not* a separate role — it is assistant text, and a
 * renderer tells reasoning from a final answer via `sourceFragmentType`.
 */
export function normalizeDeepSeek(raw: DeepSeekRawData): readonly UnifiedConversation[] {
  return raw.conversations.map(toUnifiedConversation);
}

function toUnifiedConversation(conversation: DeepSeekRawConversation): UnifiedConversation {
  const rolesByTurn = resolveTurnRoles(conversation.fragments);

  const messages: UnifiedMessage[] = conversation.fragments.map((fragment, index) => ({
    role: toUnifiedRole(fragment, rolesByTurn),
    kind: toUnifiedKind(fragment),
    ...toPayload(fragment),
    // The raw type is kept verbatim so no fidelity is lost by the mapping above.
    sourceFragmentType: fragment.type,
    // `order` mirrors the parser's graph walk, which is the true reading order.
    order: index,
    ...(fragment.model === undefined ? {} : { model: fragment.model }),
    ...(fragment.insertedAt === undefined ? {} : { createdAt: fragment.insertedAt }),
  }));

  // `exactOptionalPropertyTypes`: absent metadata is omitted, never `undefined`.
  return {
    sourceProvider: 'deepseek',
    sourceConversationId: conversation.id,
    ...(conversation.title === undefined ? {} : { title: conversation.title }),
    ...(conversation.insertedAt === undefined ? {} : { createdAt: conversation.insertedAt }),
    // `updatedAt` is the export's own conversation-level `updated_at`, verbatim —
    // deliberately *not* recomputed from the newest message timestamp (ADR #8).
    // The two genuinely differ (in the fixture, 23:25:55.182 vs. 23:25:52.537),
    // because a conversation can change without adding a message, so recomputing
    // would report a time the platform never recorded. If a later unit needs
    // "time of last message" it can derive it from `messages` — the reverse is
    // impossible once the exported value has been overwritten.
    ...(conversation.updatedAt === undefined ? {} : { updatedAt: conversation.updatedAt }),
    messages,
  };
}

/** The payload half of a unified message: exactly the field its `kind` implies. */
type MessagePayload = Pick<UnifiedMessage, 'content' | 'attachments' | 'toolActivity'>;

/**
 * Fills exactly one payload field, chosen by the fragment's category.
 *
 * Absent payloads are *omitted* rather than set to `undefined`, so
 * `'content' in message` stays a reliable check for consumers.
 */
function toPayload(fragment: DeepSeekRawFragment): MessagePayload {
  if (fragment.category === 'attachment') {
    return { attachments: (fragment.files ?? []).map(toUnifiedAttachment) };
  }

  if (fragment.category === 'toolActivity') {
    return { toolActivity: toUnifiedToolActivity(fragment) };
  }

  // Text — `content` is absent only for an unrecognised type, which is preserved
  // rather than dropped (`03-modular-parsing.md` → Edge Cases).
  return fragment.content === undefined ? {} : { content: fragment.content };
}

/** Copies a parsed file across to the unified shape; no value is reinterpreted. */
function toUnifiedAttachment(file: DeepSeekRawFile): UnifiedAttachment {
  return { fileId: file.fileId, fileName: file.fileName, fileSize: file.fileSize };
}

/**
 * Describes a tool step.
 *
 * `results` is copied through **unmodified** when present and omitted otherwise:
 * `SEARCH`/`TOOL_SEARCH` may carry it while `TOOL_OPEN`/`TOOL_FIND` never do, and
 * inventing an empty payload would fabricate data the export never contained.
 */
function toUnifiedToolActivity(fragment: DeepSeekRawFragment): UnifiedToolActivity {
  return {
    activityType: fragment.type,
    ...(fragment.results === undefined ? {} : { results: fragment.results }),
  };
}

/** Maps a fragment's structural category onto the unified `kind` discriminator. */
function toUnifiedKind(fragment: DeepSeekRawFragment): UnifiedMessageKind {
  switch (fragment.category) {
    case 'attachment':
      return 'attachment';
    case 'toolActivity':
      return 'tool_activity';
    default:
      return 'text';
  }
}

/**
 * Maps DeepSeek's fragment `type` onto the unified role vocabulary.
 *
 * An unrecognised type becomes `'unknown'` rather than an error: dropping a
 * message would lose user data, which the spec's Edge Cases forbid. The mapping
 * is case-insensitive because casing is not a documented guarantee.
 */
function toUnifiedRole(
  fragment: DeepSeekRawFragment,
  rolesByTurn: ReadonlyMap<number, UnifiedRole>,
): UnifiedRole {
  switch (fragment.type.toUpperCase()) {
    case 'REQUEST':
      return 'user';
    // Reasoning and tool steps are all assistant activity.
    case 'RESPONSE':
    case 'THINK':
    case 'SEARCH':
    case 'TOOL_SEARCH':
    case 'TOOL_OPEN':
    case 'TOOL_FIND':
      return 'assistant';
    case 'FILE':
      // An attachment states no sender of its own: it belongs to whoever sent the
      // message it arrived with.
      return rolesByTurn.get(fragment.turnIndex) ?? 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Works out who owns each turn, using only the fragments that state a role
 * themselves (`REQUEST` → user, `RESPONSE`/`THINK` → assistant).
 *
 * A turn holding *nothing but* a `FILE` inherits from the closest preceding turn
 * that does state one — a file uploaded on its own still belongs to the person who
 * uploaded it. With no such turn anywhere (a file-only conversation) the role
 * stays `unknown` rather than being guessed.
 */
function resolveTurnRoles(
  fragments: readonly DeepSeekRawFragment[],
): ReadonlyMap<number, UnifiedRole> {
  const roles = new Map<number, UnifiedRole>();

  for (const fragment of fragments) {
    if (roles.has(fragment.turnIndex)) {
      continue;
    }
    const role = statedRole(fragment.type);
    if (role !== undefined) {
      roles.set(fragment.turnIndex, role);
    }
  }

  let inherited: UnifiedRole | undefined;
  for (const fragment of fragments) {
    const own = roles.get(fragment.turnIndex);
    if (own === undefined) {
      if (inherited !== undefined) {
        roles.set(fragment.turnIndex, inherited);
      }
      continue;
    }
    inherited = own;
  }

  return roles;
}

/** The role a fragment type asserts on its own, or `undefined` if it asserts none. */
function statedRole(type: string): UnifiedRole | undefined {
  switch (type.toUpperCase()) {
    case 'REQUEST':
      return 'user';
    case 'RESPONSE':
    case 'THINK':
      return 'assistant';
    default:
      return undefined;
  }
}

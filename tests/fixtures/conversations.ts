import type { LibraryEntry } from '@/types/storage';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation, UnifiedMessage } from '@/types/conversation';

/**
 * Builders for library tests.
 *
 * Factories rather than frozen constants so each test states only the field it
 * cares about, and so `exactOptionalPropertyTypes` is respected: optional fields
 * are *omitted* when not supplied, never set to `undefined`.
 */

export function makeMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    role: 'user',
    kind: 'text',
    content: 'سلام',
    sourceFragmentType: 'REQUEST',
    order: 0,
    ...overrides,
  };
}

interface ConversationOptions {
  readonly sourceConversationId?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly messages?: readonly UnifiedMessage[];
}

export function makeConversation(options: ConversationOptions = {}): UnifiedConversation {
  return {
    sourceProvider: 'deepseek',
    sourceConversationId: options.sourceConversationId ?? 'conv-1',
    messages: options.messages ?? [makeMessage()],
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.updatedAt === undefined ? {} : { updatedAt: options.updatedAt }),
  };
}

interface EntryOptions {
  readonly id: number;
  readonly title?: string;
  readonly importedAt?: number;
  readonly messageCount?: number;
  /**
   * Defaults to DeepSeek because every suite predating Unit 13 assumed a
   * single-platform library; platform-grouping tests opt in explicitly.
   */
  readonly platform?: ProviderId;
}

export function makeEntry(options: EntryOptions): LibraryEntry {
  return {
    id: options.id,
    platform: options.platform ?? 'deepseek',
    importedAt: options.importedAt ?? 1_700_000_000_000,
    messageCount: options.messageCount ?? 1,
    ...(options.title === undefined ? {} : { title: options.title }),
  };
}

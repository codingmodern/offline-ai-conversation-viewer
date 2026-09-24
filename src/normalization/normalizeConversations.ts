import type { UnifiedConversation } from '@/types/conversation';
import type { ProviderRawData } from '@/types/providers';
import type { DeepSeekRawData } from '@/parsers/deepseek/types';
import type { ClaudeRawData } from '@/parsers/claude/types';
import type { GeminiRawData } from '@/parsers/gemini/types';
import type { ChatGptRawData } from '@/parsers/chatgpt/types';
import { normalizeDeepSeek } from '@/normalization/deepseek';
import { normalizeClaude } from '@/normalization/claude';
import { normalizeGemini } from '@/normalization/gemini';
import { normalizeChatGpt } from '@/normalization/chatgpt';

/**
 * The single entry point of the normalization layer — and the only place in the
 * codebase where `UnifiedConversation` values are created
 * (`03-modular-parsing-system.md` FR3).
 *
 * It dispatches on `providerId`, so each platform's mapping stays in its own
 * module and adding a platform means adding one `case` (plus its mapper), never
 * editing an existing one (FR7). Unit 09 added Claude, Unit 10 Gemini and Unit
 * 11 ChatGPT exactly that way.
 *
 * It receives `parse()` output only; raw JSON never reaches this layer (NFR3).
 */
export function normalizeConversations(raw: ProviderRawData): readonly UnifiedConversation[] {
  switch (raw.providerId) {
    case 'deepseek':
      // Safe narrowing: `providerId` is the discriminant of the Raw Data union,
      // and only `parse()` in `parsers/deepseek/` can produce this id.
      return normalizeDeepSeek(raw as DeepSeekRawData);
    case 'claude':
      return normalizeClaude(raw as ClaudeRawData);
    case 'gemini':
      return normalizeGemini(raw as GeminiRawData);
    case 'chatgpt':
      return normalizeChatGpt(raw as ChatGptRawData);
  }
}

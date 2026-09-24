import type { ProviderId } from '@/types/providers';

/**
 * Human-readable platform names, shared by every Shell surface that names a
 * stored record's platform (`ConversationListItem` row, `MetadataPanel`).
 *
 * A lookup rather than the raw id so the UI never shows an internal token;
 * adding a platform is one entry here. Note these labels describe a *stored
 * record*, not conversation content — no provider theming is applied (Unit 04
 * FR10). Extracted from `ConversationListItem` so Unit 05's Metadata Panel can
 * name the platform from the same single source instead of duplicating the map.
 */
export const PLATFORM_LABEL: Record<ProviderId, string> = {
  deepseek: 'DeepSeek',
  claude: 'Claude',
  gemini: 'Gemini',
  // Registered by Unit 11a (provider + normalization); its theme and picker flag
  // arrive in Unit 11b. The label exists because the map is exhaustive over
  // `ProviderId` — a stored ChatGPT record must never render an internal token.
  chatgpt: 'ChatGPT',
};

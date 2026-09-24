/**
 * The four platforms offered in Step 1 of the guided import flow
 * (`08-guided-import-flow.md`). Deliberately separate from `ProviderId`:
 * "offered in the picker" and "has a parser" are different facts (spec FR2/FR4).
 * Unit 09 flipped Claude's `available` flag once its parser shipped.
 */
export type PlatformOptionId = 'chatgpt' | 'claude' | 'deepseek' | 'gemini';

export interface PlatformOption {
  readonly id: PlatformOptionId;
  readonly label: string;
  /** False for platforms whose parser ships later (Claude joined in Unit 09). */
  readonly available: boolean;
  /** CSS custom property holding the brand color/gradient for icon + accents. */
  readonly brandToken: string;
}

/** Picker order per spec §2: ChatGPT, Claude, DeepSeek, Gemini. */
export const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  { id: 'chatgpt', label: 'ChatGPT', available: true, brandToken: 'var(--brand-chatgpt)' },
  { id: 'claude', label: 'Claude', available: true, brandToken: 'var(--brand-claude)' },
  { id: 'deepseek', label: 'DeepSeek', available: true, brandToken: 'var(--brand-deepseek)' },
  { id: 'gemini', label: 'Gemini', available: true, brandToken: 'var(--brand-gemini)' },
];

export function findPlatformOption(id: PlatformOptionId): PlatformOption | undefined {
  return PLATFORM_OPTIONS.find((option) => option.id === id);
}

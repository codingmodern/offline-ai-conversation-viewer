import type { ParseResult } from '@/types/errors';

/**
 * Provider contract shared by the detection layer (Unit 02) and the parsing
 * layer (Unit 03).
 *
 * Why one contract in `types/`: `code-standards.md` §4 requires every module in
 * `parsers/{provider}/` to expose the same fixed shape, and §2 forbids
 * duplicating shared models outside `types/`.
 *
 * `parse()` was added to the *same* module objects in Unit 03, so the registry
 * itself did not change (`02-platform-detection.md` FR1/FR8):
 * `findProviderModule()` is the single `parse()`-resolution hook.
 */

/**
 * Identifier of a supported platform.
 *
 * A new platform is added by extending this union and registering its module —
 * no existing provider code changes (FR8). Claude joined in Unit 09 from a real
 * local export, Gemini in Unit 10, and ChatGPT in Unit 11 from a provisional
 * synthetic fixture set (`tests/fixtures/chatgpt/`, ADR-A — re-check against the
 * first real export).
 */
export type ProviderId = 'deepseek' | 'claude' | 'gemini' | 'chatgpt';

/**
 * Platform-specific parser output, before normalization.
 *
 * Deliberately opaque: each provider defines its own Raw Data shape (e.g.
 * `DeepSeekRawData`) and only that provider's normalizer knows how to read it.
 * Keeping it opaque at the registry level is what stops `UnifiedConversation`
 * from leaking into `parsers/` (`03-modular-parsing-system.md` FR1/NFR3).
 */
export interface ProviderRawData {
  /** Discriminant so normalization can narrow to the right mapper safely. */
  readonly providerId: ProviderId;
}

/** The fixed shape every `parsers/{provider}/` module must expose. */
export interface ProviderModule {
  readonly id: ProviderId;
  /**
   * True when `rawJson` structurally matches this platform's export format.
   *
   * Implementations must judge **structure only** (keys, object/array shape) —
   * never the file name or extension (FR2) — and must not depend on any other
   * provider module (Invariant #3).
   */
  readonly detect: (rawJson: unknown) => boolean;
  /**
   * Converts validated JSON into this platform's **Raw Data**: a structural,
   * provider-shaped intermediate. It must never return `UnifiedConversation` —
   * producing that is `normalization/`'s exclusive job (FR1/FR3).
   *
   * Returns a `ParseResult` instead of throwing, so a malformed export is a
   * typed failure (FR6), and depends on no other provider (Invariant #3).
   */
  readonly parse: (rawJson: unknown) => ParseResult<ProviderRawData>;
}

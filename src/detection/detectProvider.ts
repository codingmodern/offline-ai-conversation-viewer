import { parseFailure, parseSuccess, type ParseResult } from '@/types/errors';
import type { ProviderId, ProviderModule } from '@/types/providers';
import { PROVIDER_MODULES } from '@/detection/registry';

/**
 * Sole authority on "which platform does this file belong to?"
 * (`02-platform-detection.md` → Responsibility boundary).
 *
 * Pure function (no `File`, no `Worker`, no DOM) so the rules are unit-testable
 * without a worker environment — the same split that keeps `validateJsonText`
 * testable in Unit 01.
 *
 * The registry is injectable so ambiguity and extensibility can be tested with
 * stub modules instead of tampering with real providers.
 */
export function detectProvider(
  rawJson: unknown,
  modules: readonly ProviderModule[] = PROVIDER_MODULES,
): ParseResult<ProviderId> {
  const matches: ProviderId[] = [];

  // Every provider is asked, in registry order, with no early exit: the number
  // of matches is what decides success vs. ambiguity (FR4/FR7).
  for (const module of modules) {
    if (runDetect(module, rawJson)) {
      matches.push(module.id);
    }
  }

  const [onlyMatch] = matches;

  if (matches.length === 1 && onlyMatch !== undefined) {
    return parseSuccess(onlyMatch);
  }

  if (matches.length === 0) {
    return parseFailure('UnsupportedFormatError', 'No registered provider matched the structure.');
  }

  // Ambiguity is reported, never resolved by picking the first match. The
  // matched ids are technical detail — console-only, never shown to the user.
  return parseFailure('AmbiguousFormatError', `Multiple providers matched: ${matches.join(', ')}.`);
}

/**
 * Runs one provider's `detect()` defensively.
 *
 * A provider that throws on unexpected input is treated as "no match" so a bug
 * in one module cannot break detection for the others (Invariant #3 +
 * `code-standards.md` §5 "Fail Gracefully").
 */
function runDetect(module: ProviderModule, rawJson: unknown): boolean {
  try {
    return module.detect(rawJson);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`[detection] ${module.id} detect() threw: ${detail}`);
    return false;
  }
}

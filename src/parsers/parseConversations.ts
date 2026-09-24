import { parseFailure, type ParseResult } from '@/types/errors';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';
import { findProviderModule } from '@/detection/registry';
import { normalizeConversations } from '@/normalization/normalizeConversations';

/**
 * Runs the parsing stage end-to-end for one already-detected file:
 * registry lookup → provider `parse()` → `normalize()`.
 *
 * Why here and not in the worker: the worker stays a thin transport shell so
 * this chain is testable without spawning one (`architecture.md` §3). It is
 * called *inside* the existing worker run, so no extra main-thread round-trip is
 * introduced (`03-modular-parsing-system.md` NFR1).
 *
 * `parse()` is resolved through `findProviderModule()` — the existing registry
 * from Unit 02 (FR2). No second registry exists.
 *
 * This function deliberately does not persist anything: handing the
 * `UnifiedConversation[]` back is the end of this unit's responsibility; Storage
 * is a later unit.
 */
export function parseConversations(
  providerId: ProviderId,
  rawJson: unknown,
): ParseResult<readonly UnifiedConversation[]> {
  const module = findProviderModule(providerId);
  if (!module) {
    // Unreachable while `providerId` comes from detection, but a missing module
    // must still surface as a typed error rather than a crash (FR6).
    return parseFailure('UnsupportedFormatError', `No registered module for "${providerId}".`);
  }

  const parsed = module.parse(rawJson);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, data: normalizeConversations(parsed.data) };
}

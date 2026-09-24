import type { ParseResult } from '@/types/errors';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';

/**
 * Message contract between the UI thread and the import pipeline worker.
 * Declared in its own module so both sides import the same source of truth.
 */

/** Sent to the worker. The `File` itself is transferable via structured clone. */
export interface ImportRequest {
  /** Correlates the response with the originating file in a multi-file import. */
  readonly requestId: string;
  readonly file: File;
}

/**
 * Successful outcome of the worker's run: the platform that claimed the file and
 * its conversations, already normalized.
 *
 * Validation, detection, parsing and normalization all happen in *one*
 * round-trip (`02-platform-detection.md` NFR1, `03-modular-parsing-system.md`
 * NFR1), so no intermediate stage returns to the main thread on its own.
 *
 * `UnifiedConversation` is plain data, so it survives `postMessage`'s structured
 * clone unchanged.
 */
export interface ImportedPayload {
  readonly providerId: ProviderId;
  readonly conversations: readonly UnifiedConversation[];
}

/** Sent back by the worker. */
export interface ImportResponse {
  readonly requestId: string;
  readonly result: ParseResult<ImportedPayload>;
}

/// <reference lib="webworker" />
import { parseFailure } from '@/types/errors';
import { validateJsonText } from '@/features/import/validateJsonText';
import { detectProvider } from '@/detection/detectProvider';
import { parseConversations } from '@/parsers/parseConversations';
import type { ImportRequest, ImportResponse } from '@/features/import/workerContract';

/**
 * Reads, validates, platform-detects, parses and normalizes a JSON file off the
 * main thread.
 *
 * Why a worker: `01-import-validation.md` FR5/NFR2 require that reading and
 * parsing (up to ~50MB) never block the UI. `file.text()`, `JSON.parse` and the
 * per-conversation mapping are all expensive, so all of them run here.
 *
 * Why every stage is chained here rather than in separate messages: Unit 02 NFR1
 * and Unit 03 NFR1 both require the pipeline to continue inside this same worker
 * run, with no extra round-trip to the main thread.
 *
 * This worker is intentionally thin: validation lives in `validateJsonText`,
 * detection in `detectProvider`, and parsing+normalization in
 * `parseConversations`, so every rule is testable without a worker.
 *
 * Nothing is persisted here — the normalized conversations are posted back and
 * storage remains a later unit's concern.
 */
self.onmessage = async (event: MessageEvent<ImportRequest>): Promise<void> => {
  const { requestId, file } = event.data;

  try {
    const text = await file.text();
    const validation = validateJsonText(text);
    if (!validation.ok) {
      respond({ requestId, result: validation });
      return;
    }

    const detection = detectProvider(validation.data);
    if (!detection.ok) {
      respond({ requestId, result: detection });
      return;
    }

    const parsed = parseConversations(detection.data, validation.data);
    if (!parsed.ok) {
      respond({ requestId, result: parsed });
      return;
    }

    respond({
      requestId,
      result: { ok: true, data: { providerId: detection.data, conversations: parsed.data } },
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // Distinguish "cannot read from disk" from "content is invalid": the former
    // is an I/O failure, the latter is handled inside validateJsonText.
    respond({ requestId, result: parseFailure('FileReadError', detail) });
  }
};

function respond(response: ImportResponse): void {
  self.postMessage(response);
}

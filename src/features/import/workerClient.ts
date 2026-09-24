import { parseFailure, type ParseResult } from '@/types/errors';
import type {
  ImportedPayload,
  ImportRequest,
  ImportResponse,
} from '@/features/import/workerContract';
import ImportPipelineWorker from '@/workers/importPipeline.worker.ts?worker';

/**
 * Promise wrapper around the import pipeline worker
 * (read → validate → detect → parse → normalize).
 *
 * One worker per file (rather than a shared pool): files must not block each
 * other (`01-import-validation.md` NFR4), and a crash while handling a huge file
 * then cannot take down other in-flight imports. The worker is always terminated
 * so no thread leaks across imports.
 */
export function processFileInWorker(
  file: File,
  requestId: string,
  createWorker: () => Worker = () => new ImportPipelineWorker(),
): Promise<ParseResult<ImportedPayload>> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch (cause) {
      // Worker construction can fail in environments without Worker support.
      resolve(
        parseFailure(
          'UnexpectedImportError',
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
      return;
    }

    const settle = (result: ParseResult<ImportedPayload>): void => {
      worker.terminate();
      resolve(result);
    };

    worker.onmessage = (event: MessageEvent<ImportResponse>): void => {
      // Ignore stray messages that do not belong to this request.
      if (event.data.requestId !== requestId) {
        return;
      }
      settle(event.data.result);
    };

    // Fires on an uncaught worker error, e.g. out-of-memory on a very large file.
    worker.onerror = (event: ErrorEvent): void => {
      settle(parseFailure('UnexpectedImportError', event.message));
    };

    const request: ImportRequest = { requestId, file };
    worker.postMessage(request);
  });
}

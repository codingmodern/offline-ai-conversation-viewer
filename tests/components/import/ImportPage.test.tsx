import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import type { ProviderId } from '@/types/providers';
import type { UnifiedConversation } from '@/types/conversation';
import { makeConversation } from '@/../tests/fixtures/conversations';
import minimalChatGpt from '@/../tests/fixtures/chatgpt/minimal.json';
import structureChatGpt from '@/../tests/fixtures/chatgpt/structure.json';
import shardA from '@/../tests/fixtures/chatgpt/shards/conversations-000.json';
import shardB from '@/../tests/fixtures/chatgpt/shards/conversations-001.json';
import manifest from '@/../tests/fixtures/chatgpt/shards/not-a-conversation.json';

/**
 * The worker client is mocked, not the pipeline rules: jsdom provides no
 * `Worker`, so this suite exercises the real pipeline (type gate, hook, UI)
 * while the worker's read step is replaced by the in-process `validateJsonText`
 * `detectProvider` `parseConversations` chain. Unit 08: every test walks the
 * guided flow Step 1 (platform), Step 2 (file), Step 3 (preview + confirm).
 */
vi.mock('@/features/import/workerClient', () => ({
  processFileInWorker: vi.fn(),
}));

const { processFileInWorker } = await import('@/features/import/workerClient');
const { validateJsonText } = await import('@/features/import/validateJsonText');
const { detectProvider } = await import('@/detection/detectProvider');
const { parseConversations } = await import('@/parsers/parseConversations');
const { ImportPage } = await import('@/components/import/ImportPage');
const { LARGE_FILE_WARNING_BYTES } = await import('@/features/import/fileTypeGuard');
const { db } = await import('@/storage/db');
const { saveConversation } = await import('@/storage/conversationStore');

const mockedProcess = vi.mocked(processFileInWorker);

/** Mirrors the worker: validate, detect, parse, normalize in one pass. */
function useRealPipeline(): void {
  mockedProcess.mockImplementation(async (file) => {
    const validation = validateJsonText(await file.text());
    if (!validation.ok) {
      return validation;
    }
    const detection = detectProvider(validation.data);
    if (!detection.ok) {
      return detection;
    }
    const parsed = parseConversations(detection.data, validation.data);
    if (!parsed.ok) {
      return parsed;
    }
    return { ok: true, data: { providerId: detection.data, conversations: parsed.data } };
  });
}

/**
 * Simulates a file from a platform whose parser rejected the file (FR7): the
 * worker seam reports a foreign providerId, exactly what a mismatched export
 * produces at detection time. The lie stays at this seam only.
 */
function useForeignPipeline(provider: string): void {
  mockedProcess.mockImplementation(async (file) => {
    const validation = validateJsonText(await file.text());
    if (!validation.ok) {
      return validation;
    }
    return {
      ok: true,
      data: {
        providerId: provider as unknown as ProviderId,
        conversations: [makeConversation({ sourceConversationId: `foreign-${file.name}` })],
      },
    };
  });
}

function jsonFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/json' });
}

/** Text of a JSON file that the DeepSeek signature accepts. */
const DEEPSEEK_JSON = JSON.stringify([
  { id: 'c1', mapping: { '1': { message: { fragments: [{ type: 'REQUEST', content: 'hi' }] } } } },
]);

/** Returns the dropzone container element. */
function dropzone(): HTMLElement {
  const zone = screen.getByText('فایل خروجی گفتگو را وارد کنید').parentElement;
  if (!zone) {
    throw new Error('Dropzone element was not found.');
  }
  return zone;
}

/** Simulates dropping files, which bypasses the picker's `accept` filter. */
function dropFiles(files: readonly File[]): void {
  fireEvent.drop(dropzone(), { dataTransfer: { files } });
}

/** Step 1 then Step 2: DeepSeek stands in for any parser-backed platform. */
async function chooseDeepSeekAndContinue(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
  await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
}

/** Step 1 then Step 2 with ChatGPT picked (Unit 11b). */
async function chooseChatGptAndContinue(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'ChatGPT' }));
  await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
}

describe('ImportPage — guided flow (Unit 08)', () => {
  beforeEach(() => {
    mockedProcess.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('offers the four platforms and keeps Continue disabled until one is chosen', () => {
    render(<ImportPage />);

    // All four platforms are parser-backed and available (Unit 11b): no
    // roadmap badge exists any more — ChatGPT was the last one to join.
    expect(screen.getByRole('button', { name: 'ChatGPT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claude' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DeepSeek' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gemini' })).toBeInTheDocument();
    expect(screen.queryByText('به‌زودی')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'مرحله بعد' })).toBeDisabled();
  });

  it('moves to the file step once DeepSeek is chosen', async () => {
    render(<ImportPage />);

    await chooseDeepSeekAndContinue();

    expect(screen.getByText('فایل خروجی گفتگو را وارد کنید')).toBeInTheDocument();
    // The step indicator marks the file step as current (FR5): the mark "2"
    // is on screen for the active step. The "3" mark is the next, still todo.
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('shows a success row for a recognised JSON file chosen from the picker', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    await userEvent.upload(
      screen.getByLabelText('انتخاب فایل JSON'),
      jsonFile('chat.json', DEEPSEEK_JSON),
    );

    expect(await screen.findByText('معتبر')).toBeInTheDocument();
    expect(screen.getByText('chat.json')).toBeInTheDocument();
  });

  it('rejects valid JSON that belongs to no supported platform inside Step 2', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    await userEvent.upload(
      screen.getByLabelText('انتخاب فایل JSON'),
      jsonFile('unknown.json', '{"messages":[{"role":"user"}]}'),
    );

    // Contract: the unrecognized file is rejected inside Step 2. The production
    // Persian error copy contains a ZWNJ that is fragile to mirror, so we
    // assert the locale-stable row status instead.
    // The error row carries a data-status attribute (Unit 01 design), which
    // is the locale-stable signal for "this file failed" without depending
    // on the Persian error reason copy.
    expect(await screen.findByText("unknown.json")).toBeInTheDocument();
    const errorRow = screen.getByText("unknown.json").closest("[data-status]");
    expect(errorRow).toHaveAttribute("data-status", "error");
    expect(screen.getByText("unknown.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مرحله بعد" })).toBeDisabled();
  });
  it('rejects a dropped non-JSON file before any parsing happens', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    // Dropped via drag and drop because the picker's `accept` filter already
    // hides non-JSON files; the guard must still catch what slips through.
    dropFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);

    // Match permissively: the production copy uses a ZWNJ that the test should
    // not have to mirror — the user-facing meaning is what matters.
    expect(
      await screen.findByText(/فقط فایل JSON/),
    ).toBeInTheDocument();
    expect(mockedProcess).not.toHaveBeenCalled();
  });

  it('reports an empty file separately from a malformed one', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    await userEvent.upload(screen.getByLabelText('انتخاب فایل JSON'), jsonFile('empty.json', ''));

    expect(
      await screen.findByText('این فایل خالی است و محتوایی برای نمایش ندارد.'),
    ).toBeInTheDocument();
  });

  it('keeps per-file results independent when several files are imported at once', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    await userEvent.upload(screen.getByLabelText('انتخاب فایل JSON'), [
      jsonFile('good.json', DEEPSEEK_JSON),
      jsonFile('bad.json', 'nope'),
    ]);

    // The failure must not remove the successful row (Unit 01 FR8).
    expect(await screen.findByText('معتبر')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'این فایل قابل خواندن نیست. لطفاً از خروجی رسمی پلتفرم استفاده کنید.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for confirmation before parsing a file larger than 50MB', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();
    const big = jsonFile('big.json', DEEPSEEK_JSON);
    Object.defineProperty(big, 'size', { value: LARGE_FILE_WARNING_BYTES + 1 });

    await userEvent.upload(screen.getByLabelText('انتخاب فایل JSON'), big);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockedProcess).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ادامه' }));

    expect(await screen.findByText('معتبر')).toBeInTheDocument();
  });

  it('does not parse a large file when the user cancels', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();
    const big = jsonFile('big.json', DEEPSEEK_JSON);
    Object.defineProperty(big, 'size', { value: LARGE_FILE_WARNING_BYTES + 1 });

    await userEvent.upload(screen.getByLabelText('انتخاب فایل JSON'), big);
    await userEvent.click(await screen.findByRole('button', { name: 'انصراف' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockedProcess).not.toHaveBeenCalled();
  });

  it('highlights the dropzone while a file is dragged over it', async () => {
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    fireEvent.dragOver(dropzone());
    expect(dropzone()).toHaveAttribute('data-dragging', 'true');

    fireEvent.dragLeave(dropzone());
    expect(dropzone()).toHaveAttribute('data-dragging', 'false');
  });
  it('flags a parsed file whose platform differs from the choice and blocks Continue', async () => {
    useForeignPipeline('chatgpt');
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    dropFiles([jsonFile('maybe-chatgpt.json', DEEPSEEK_JSON)]);

    // The file still parses — detection is the authority — so the row succeeds,
    // and the mismatch banner names both platforms (FR7/FR8).
    expect(await screen.findByText('معتبر')).toBeInTheDocument();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('ChatGPT');
    expect(banner).toHaveTextContent('نه DeepSeek');
    expect(screen.getByRole('button', { name: 'مرحله بعد' })).toBeDisabled();
  });

  it('offers replace-files and re-pick-platform from the mismatch banner', async () => {
    useForeignPipeline('chatgpt');
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();
    dropFiles([jsonFile('maybe-chatgpt.json', DEEPSEEK_JSON)]);
    await screen.findByRole('alert');

    // Re-pick: back to Step 1, files kept so a corrected choice reuses them.
    await userEvent.click(screen.getByRole('button', { name: 'بازگشت به انتخاب پلتفرم' }));
    expect(screen.getByRole('button', { name: 'DeepSeek' })).toBeInTheDocument();

    await chooseDeepSeekAndContinue();
    expect(screen.getByText('maybe-chatgpt.json')).toBeInTheDocument();

    // Replace: the parsed batch is dropped and the banner disappears.
    await userEvent.click(screen.getByRole('button', { name: 'انتخاب فایل دیگر' }));
    expect(screen.queryByText('maybe-chatgpt.json')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirms the whole batch exactly once and hands it to the library', async () => {
    useRealPipeline();
    const onImported = vi.fn();
    render(<ImportPage onImported={onImported} />);
    await chooseDeepSeekAndContinue();

    dropFiles([jsonFile('batch.json', DEEPSEEK_JSON)]);
    await screen.findByText('معتبر');
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));

    // Step 3 preview (FR10): read-only duplicate count from the real database.
    expect(await screen.findByText('1 مکالمه جدید')).toBeInTheDocument();
    expect(screen.queryByText(/مکالمه تکراری/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(onImported).toHaveBeenCalledTimes(1);
    const firstCallArgs = onImported.mock.calls[0];
    expect(firstCallArgs?.[0]).toHaveLength(1);
    expect(await screen.findByText('واردات انجام شد.')).toBeInTheDocument();
  });

  it('previews every conversation as a duplicate when the library already has them', async () => {
    await db.conversations.clear();
    const seeded = makeConversation({ sourceConversationId: 'c1', title: 'اصل' });
    const saved = await saveConversation(seeded);
    expect(saved.ok).toBe(true);

    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    dropFiles([jsonFile('again.json', DEEPSEEK_JSON)]);
    await screen.findByText('معتبر');
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));

    expect(await screen.findByText('1 مکالمه تکراری')).toBeInTheDocument();
    expect(screen.getByText('همه مکالمهها تکراری هستند و چیزی اضافه نمیشود.'));
    expect(screen.queryByText(/مکالمه جدید/)).not.toBeInTheDocument();
  });

  it('keeps the parsed batch when going back to Step 1 and returning', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    dropFiles([jsonFile('kept.json', DEEPSEEK_JSON)]);
    await screen.findByText('معتبر');

    await userEvent.click(screen.getByRole('button', { name: 'مرحله قبل' }));
    expect(screen.getByRole('button', { name: 'DeepSeek' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    // FR9: returning to Step 2 shows the same file — no re-drop, no reset.
    expect(screen.getByText('kept.json')).toBeInTheDocument();
  });
});

/**
 * Unit 11b acceptance, AC1–AC4 — the run 11a deferred from its own AC list
 * (`11-chatgpt-platform.md` AC 1/2/8) to a real UI pass, now that ChatGPT is
 * selectable. Every case uses the **real** pipeline (`useRealPipeline`), so
 * detection, parse and normalization run for ChatGPT exactly as they will in
 * production; only the worker's process boundary runs in-process.
 */
describe('ImportPage — ChatGPT through the real UI (Unit 11b AC1–AC4)', () => {
  beforeEach(() => {
    mockedProcess.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('imports minimal.json: 1 conversation labeled ChatGPT with 3 messages (AC1)', async () => {
    useRealPipeline();
    const onImported = vi.fn();
    render(<ImportPage onImported={onImported} />);
    await chooseChatGptAndContinue();

    dropFiles([jsonFile('minimal.json', JSON.stringify(minimalChatGpt))]);
    await screen.findByText('معتبر');
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));

    expect(await screen.findByText('1 مکالمه جدید')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(await screen.findByText('واردات انجام شد.')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
    const batch = onImported.mock.calls[0]?.[0] as readonly UnifiedConversation[];
    expect(batch).toHaveLength(1);

    const [conversation] = batch;
    expect(conversation?.sourceProvider).toBe('chatgpt');
    expect(conversation?.title).toBe('عنوان گفتگو');
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    // Persian text survives byte-for-byte through the whole UI path.
    expect(conversation?.messages.map((message) => message.content)).toEqual([
      'سلام',
      'سلام! چطور می‌توانم کمک کنم؟',
      'ساختار conversations.json چیست؟',
    ]);
  });
  it('imports structure.json with no system, hidden or context message (AC2)', async () => {
    useRealPipeline();
    const onImported = vi.fn();
    render(<ImportPage onImported={onImported} />);
    await chooseChatGptAndContinue();

    dropFiles([jsonFile('structure.json', JSON.stringify(structureChatGpt))]);
    await screen.findByText('معتبر');
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));

    expect(await screen.findByText('1 مکالمه جدید')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(await screen.findByText('واردات انجام شد.')).toBeInTheDocument();
    const batch = onImported.mock.calls[0]?.[0] as readonly UnifiedConversation[];
    expect(batch).toHaveLength(1);

    // The FR-5 filter: only the three live messages survive, in thread order.
    const [conversation] = batch;
    expect(conversation?.messages.map((message) => message.content)).toEqual([
      'سلام',
      'سلام! چطور کمکی کنم؟',
      'پاسخ دوم',
    ]);
    expect(conversation?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
    // No context message (custom instructions / memory) leaks through either.
    for (const message of conversation?.messages ?? []) {
      expect(['user_editable_context', 'model_editable_context']).not.toContain(
        message.sourceFragmentType,
      );
    }
  });

  it('imports both shards and fails the extra JSON file alone (AC3)', async () => {
    useRealPipeline();
    const onImported = vi.fn();
    render(<ImportPage onImported={onImported} />);
    await chooseChatGptAndContinue();

    dropFiles([
      jsonFile('conversations-000.json', JSON.stringify(shardA)),
      jsonFile('conversations-001.json', JSON.stringify(shardB)),
      jsonFile('not-a-conversation.json', JSON.stringify(manifest)),
    ]);

    // Both shards succeed; the manifest is rejected on its own and blocks
    // nothing else (spec 11 AC8 — the behaviour the shard fixtures exist to prove).
    const successRows = await screen.findAllByText('معتبر');
    expect(successRows).toHaveLength(2);
    const failedRow = await screen.findByText('not-a-conversation.json');
    expect(failedRow.closest('[data-status]')).toHaveAttribute('data-status', 'error');
    expect(screen.getByText('conversations-000.json')).toBeInTheDocument();
    expect(screen.getByText('conversations-001.json')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    // 2 conversations in shard A + 1 in shard B = 3 new records; the failed
    // file contributes nothing.
    expect(await screen.findByText('3 مکالمه جدید')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(await screen.findByText('واردات انجام شد.')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
    const batch = onImported.mock.calls[0]?.[0] as readonly UnifiedConversation[];
    expect(batch.map((conversation) => conversation.sourceConversationId)).toEqual([
      'shard-a1',
      'shard-a2',
      'shard-b1',
    ]);
    expect(batch.every((conversation) => conversation.sourceProvider === 'chatgpt')).toBe(true);
  });
  it('blocks a DeepSeek file while ChatGPT is picked (AC4, direction 1)', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseChatGptAndContinue();

    dropFiles([jsonFile('deepseek-file.json', DEEPSEEK_JSON)]);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('DeepSeek');
    expect(banner).toHaveTextContent('نه ChatGPT');
    expect(screen.getByRole('button', { name: 'مرحله بعد' })).toBeDisabled();
  });

  it('blocks a ChatGPT file while DeepSeek is picked (AC4, direction 2)', async () => {
    useRealPipeline();
    render(<ImportPage />);
    await chooseDeepSeekAndContinue();

    dropFiles([jsonFile('chatgpt-file.json', JSON.stringify(minimalChatGpt))]);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('ChatGPT');
    expect(banner).toHaveTextContent('نه DeepSeek');
    expect(screen.getByRole('button', { name: 'مرحله بعد' })).toBeDisabled();
  });
});


import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Post-import activation (ADR #12).
 *
 * This suite exists because of a bug manual testing caught and every other suite
 * missed: importing into a fresh library landed back on the Empty State — the
 * "import your first file" screen — although the library now held records, and
 * every reload over a non-empty library opened on that same misleading message.
 *
 * The seam under test is click → import → activation → conditional-render, so
 * nothing is mocked except the worker transport (jsdom has no `Worker`; the real
 * validate → detect → parse chain runs in-process, the same single pass the
 * worker performs). Storage is the real Dexie-over-fake-indexeddb database and
 * the component tree is the real `AppShell`.
 */

vi.mock('@/features/import/workerClient', () => ({
  processFileInWorker: vi.fn(),
}));

const { processFileInWorker } = await import('@/features/import/workerClient');
const { validateJsonText } = await import('@/features/import/validateJsonText');
const { detectProvider } = await import('@/detection/detectProvider');
const { parseConversations } = await import('@/parsers/parseConversations');
const { AppShell } = await import('@/components/shell/AppShell');
const { saveConversation } = await import('@/storage/conversationStore');
const { db } = await import('@/storage/db');
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
const { makeConversation } = await import('../fixtures/conversations');

const mockedProcess = vi.mocked(processFileInWorker);

const EMPTY_STATE_TITLE = 'هنوز گفتگویی ذخیره نشده است';
const IMPORT_HEADING = 'ورود فایل گفتگو';
const BACK_BUTTON = 'بازگشت به کتابخانه';

beforeEach(async () => {
  await db.conversations.clear();
  mockedProcess.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.conversations.clear();
});

/** Mirrors the worker pass in-process: validate → detect → parse → normalize. */
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

/** Seeds conversations oldest-first, so the Sidebar shows the LAST title on top. */
async function seed(titles: readonly string[]): Promise<void> {
  for (const [index, title] of titles.entries()) {
    await saveConversation(makeConversation({ sourceConversationId: `c-${String(index)}`, title }));
  }
}

/** One DeepSeek export entry, carrying its own id and title. */
function deepseekEntry(id: string, title: string): Record<string, unknown> {
  return {
    id,
    title,
    mapping: {
      '1': {
        message: {
          fragments: [{ type: 'REQUEST', content: 'سلام' }],
        },
      },
    },
  };
}

function jsonFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/json' });
}

/** Returns the dropzone container element. */
function dropzone(): HTMLElement {
  const zone = screen.getByText('فایل خروجی گفتگو را وارد کنید').parentElement;
  if (!zone) {
    throw new Error('Dropzone element was not found.');
  }
  return zone;
}

/** Simulates dropping files onto the import screen. */
function dropFiles(files: readonly File[]): void {
  fireEvent.drop(dropzone(), { dataTransfer: { files } });
}

/**
 * Matches a row's select button by title.
 *
 * Anchored, because a row's accessible name begins with the title and continues
 * with metadata, while its delete button is named "حذف <title>".
 */
function rowName(title: string): RegExp {
  return new RegExp(`^${title}`);
}

async function waitForRow(title: string): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole('button', { name: rowName(title) }));
}

/** The sidebar's add action, matched loosely so its "+" affix is not load-bearing. */
function addButton(): HTMLElement {
  return screen.getByRole('button', { name: /افزودن گفتگو/ });
}

/** Walks Step 1 then Step 2 of the guided import (Unit 08). */
async function openImportAndPickDeepSeek(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'وارد کردن فایل گفتگو' }));
  await userEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
  await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
}

/** The same but reached from the Sidebar's "+ افزودن گفتگو" (ADR #12). */
async function sidebarAddAndPickDeepSeek(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(addButton());
  await user.click(screen.getByRole('button', { name: 'DeepSeek' }));
  await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
}

describe('post-import activation (ADR #12)', () => {
  it('shows the imported conversation after importing into an empty library, not the Empty State', async () => {
    useRealPipeline();
    render(<AppShell />);
    // Settled start: the genuine Empty State, because the library IS empty.
    await screen.findByText(EMPTY_STATE_TITLE);

    // Opening the import screen is what makes the dropzone exist; its own CTA
    // is the path a fresh user takes. Unit 08: now a 3-step flow.
    await openImportAndPickDeepSeek();
    dropFiles([jsonFile('chat.json', JSON.stringify([deepseekEntry('c1', 'واردشده')]))]);
    await screen.findByText('معتبر');

    // Step 3 preview, then confirm.
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    // Unit 06: the themed conversation renderer replaces the old placeholder heading.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    // The regression: this text claimed the library was empty after a save.
    expect(screen.queryByText(EMPTY_STATE_TITLE)).not.toBeInTheDocument();
    // The import screen yields to the conversation it produced.
    expect(screen.queryByRole('heading', { name: IMPORT_HEADING })).not.toBeInTheDocument();
  });

  it('activates the LAST conversation saved by a multi-conversation file', async () => {
    useRealPipeline();
    render(<AppShell />);
    await screen.findByText(EMPTY_STATE_TITLE);

    await openImportAndPickDeepSeek();
    dropFiles([
      jsonFile(
        'batch.json',
        JSON.stringify([
          deepseekEntry('c1', 'اول'),
          deepseekEntry('c2', 'دوم'),
          deepseekEntry('c3', 'سوم'),
        ]),
      ),
    ]);
    await screen.findByText('معتبر');
    await userEvent.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await userEvent.click(screen.getByRole('button', { name: 'تایید و Import' }));

    // سوم closed the batch, so it owns the main region — not the file's first row.
    // Unit 06: the themed renderer's content replaces the placeholder heading.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('سوم') })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: rowName('اول') })).not.toHaveAttribute('aria-current');
  });

  it('moves focus to a new import even when another conversation was being read', async () => {
    const user = userEvent.setup();
    useRealPipeline();
    await seed(['قبلی']);
    render(<AppShell />);

    await user.click(await waitForRow('قبلی'));
    expect(await screen.findByText('سلام')).toBeInTheDocument();

    await sidebarAddAndPickDeepSeek(user);
    dropFiles([jsonFile('new.json', JSON.stringify([deepseekEntry('c-new', 'تازه')]))]);
    await screen.findByText('معتبر');
    await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await user.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('تازه') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('skips an already-stored conversation silently and summarizes the batch (ADR #13)', async () => {
    const user = userEvent.setup();
    useRealPipeline();
    await seed(['اصل']);
    render(<AppShell />);

    await user.click(await waitForRow('اصل'));
    await sidebarAddAndPickDeepSeek(user);

    // Same natural key (deepseek, c-0): NO dialog ever appears — one summary
    // reports the skip instead.
    dropFiles([jsonFile('again.json', JSON.stringify([deepseekEntry('c-0', 'دوباره')]))]);
    await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await user.click(screen.getByRole('button', { name: 'تایید و Import' }));
    expect(
      await screen.findByText(/0 گفتگو اضافه شد، 1 گفتگوی تکراری نادیده گرفته شد/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Nothing was written and the selection underneath is untouched…
    expect(await db.conversations.count()).toBe(1);
    expect(screen.getByRole('button', { name: rowName('اصل') })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // …and leaving the import screen lands back on it, not on a blank pane.
    await user.click(screen.getByRole('button', { name: BACK_BUTTON }));
    expect(await screen.findByText('سلام')).toBeInTheDocument();
  });

  it('activates the LAST NEW conversation of a mixed batch and reports both counts', async () => {
    const user = userEvent.setup();
    useRealPipeline();
    await seed(['قدیمی']);
    render(<AppShell />);

    await user.click(await waitForRow('قدیمی'));
    await sidebarAddAndPickDeepSeek(user);

    // One duplicate + two genuinely new conversations in a single file.
    dropFiles([
      jsonFile(
        'mixed.json',
        JSON.stringify([
          deepseekEntry('c-0', 'تکراری'),
          deepseekEntry('n-1', 'نوِ اول'),
          deepseekEntry('n-2', 'نوِ دوم'),
        ]),
      ),
    ]);
    await screen.findByText('معتبر');
    await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await user.click(screen.getByRole('button', { name: 'تایید و Import' }));

    // ONE summary for the whole batch — never a confirm-per-item dialog.
    expect(
      await screen.findByText(/2 گفتگو اضافه شد، 1 گفتگوی تکراری نادیده گرفته شد/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // The last actually-SAVED conversation wins (ADR #12); the duplicate, though
    // first in the file, is skipped and never becomes active (ADR #13).
    // Unit 06: the themed renderer's content replaces the placeholder heading.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('نوِ دوم') })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(await db.conversations.count()).toBe(3);
  });

  it('changes nothing but the summary for a 100%-duplicate batch (ADR #13)', async () => {
    const user = userEvent.setup();
    useRealPipeline();
    await seed(['اول', 'دومین']);
    render(<AppShell />);
    // Auto-selection puts the newest record on screen before importing.
    await screen.findByText('سلام');

    await user.click(addButton());
    await user.click(screen.getByRole('button', { name: 'DeepSeek' }));
    await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    dropFiles([
      jsonFile(
        'dupes.json',
        JSON.stringify([deepseekEntry('c-0', 'اول تکراری'), deepseekEntry('c-1', 'دوم تکراری')]),
      ),
    ]);
    await screen.findByText('معتبر');
    await user.click(screen.getByRole('button', { name: 'مرحله بعد' }));
    await user.click(screen.getByRole('button', { name: 'تایید و Import' }));

    expect(
      await screen.findByText(/0 گفتگو اضافه شد، 2 گفتگوی تکراری نادیده گرفته شد/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Nothing added, and the selection does not move when nothing was saved.
    expect(await db.conversations.count()).toBe(2);
    expect(screen.getByRole('button', { name: rowName('دومین') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('auto-selects the newest conversation when loading a non-empty library', async () => {
    await seed(['اول', 'دوم']);
    render(<AppShell />);

    // No interaction at all: the newest record owns the main region on arrival,
    // so a reload can never reopen the "import your first file" screen.
    // Unit 06: the themed renderer's content replaces the placeholder heading.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE_TITLE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('دوم') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('degrades to the Empty State only when the active record vanishes out-of-band', async () => {
    await seed(['ماندنی', 'حذف‌شده']);
    render(<AppShell />);
    await screen.findByText('سلام');

    // Direct DB manipulation — unreachable through any app flow (ADR #12).
    const rows = await db.conversations.toArray();
    const victim = rows.find((row) => row.sourceConversationId === 'c-1');
    if (!victim) {
      throw new Error('Seeded row was not found.');
    }
    await db.conversations.delete(victim.id);

    // Records remain, but the stale selection can no longer resolve, so the
    // shell degrades to the Empty State rather than a blank pane — the only
    // route by which it renders over a non-empty library.
    expect(await screen.findByText(EMPTY_STATE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('ماندنی') })).toBeInTheDocument();
  });
});




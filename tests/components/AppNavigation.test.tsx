import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { db } from '@/storage/db';
import { saveConversation } from '@/storage/conversationStore';
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
import { makeConversation } from '../fixtures/conversations';

/**
 * Which panel the main region shows, driven from the real root component.
 *
 * This suite exists because of a bug the other 266 tests all missed: the import
 * screen was unreachable, and a fresh install could not import anything at all.
 * Every other suite either renders a component with its callbacks mocked (proving
 * the button *calls* something) or drives `useLibrary` directly (proving the state
 * *changes*). Nobody rendered `App` and clicked, so the one place the two were
 * wired together — the conditional in `AppShell` — was never exercised.
 *
 * So the rule here: render the real `App`, mock nothing, click what the user
 * clicks, and assert on what the user sees.
 */

/** The import screen's `h1`; its presence is what "the import screen is open" means. */
const IMPORT_HEADING = 'ورود فایل گفتگو';
const EMPTY_STATE_TITLE = 'هنوز گفتگویی ذخیره نشده است';

beforeEach(async () => {
  await db.conversations.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.conversations.clear();
});

async function seed(titles: readonly string[]): Promise<void> {
  for (const [index, title] of titles.entries()) {
    await saveConversation(makeConversation({ sourceConversationId: `c-${String(index)}`, title }));
  }
}

/** The sidebar's add action, matched loosely so its "+" affix is not load-bearing. */
function addButton(): HTMLElement {
  return screen.getByRole('button', { name: /افزودن گفتگو/ });
}

function rowName(title: string): RegExp {
  return new RegExp(`^${title}`);
}

async function waitForRow(title: string): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole('button', { name: rowName(title) }));
}

describe('App navigation to the import screen', () => {
  it('opens the import screen from the sidebar when the library is empty', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Wait for the first load so the click lands on the settled UI, not on the
    // loading state.
    await screen.findByText(EMPTY_STATE_TITLE);

    await user.click(addButton());

    // The regression: this heading never appeared, so a new user had no way to
    // import a single file.
    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_STATE_TITLE)).not.toBeInTheDocument();
  });

  it("opens the import screen from the Empty State's own call to action", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(EMPTY_STATE_TITLE);

    // This button was asserted to *exist* by an earlier test but never clicked —
    // which is precisely how it stayed dead.
    await user.click(screen.getByRole('button', { name: 'وارد کردن فایل گفتگو' }));

    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
  });

  it('opens the import screen while a conversation is being read', async () => {
    const user = userEvent.setup();
    await seed(['گفتگوی اول']);
    render(<App />);

    await user.click(await waitForRow('گفتگوی اول'));
    // Unit 06: selection is proven by the themed conversation renderer's
    // content (the placeholder heading was removed with the placeholder).
    expect(await screen.findByText('سلام')).toBeInTheDocument();

    await user.click(addButton());

    // Importing must not require abandoning the current conversation first.
    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
  });

  it('opens the import screen when the library has records but none is selected', async () => {
    const user = userEvent.setup();
    await seed(['گفتگوی اول']);
    render(<App />);
    await waitForRow('گفتگوی اول');

    await user.click(addButton());

    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
  });

  it('keeps the sidebar visible on the import screen, so the library is never lost', async () => {
    const user = userEvent.setup();
    await seed(['گفتگوی اول']);
    render(<App />);
    await waitForRow('گفتگوی اول');

    await user.click(addButton());
    await screen.findByRole('heading', { name: IMPORT_HEADING });

    expect(screen.getByRole('button', { name: rowName('گفتگوی اول') })).toBeInTheDocument();
  });

  it('leaves the import screen when a conversation is selected', async () => {
    const user = userEvent.setup();
    await seed(['گفتگوی اول']);
    render(<App />);
    await waitForRow('گفتگوی اول');

    await user.click(addButton());
    await screen.findByRole('heading', { name: IMPORT_HEADING });

    await user.click(screen.getByRole('button', { name: rowName('گفتگوی اول') }));

    // Unit 06: the themed conversation renderer replaces the old placeholder.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: IMPORT_HEADING })).not.toBeInTheDocument();
  });

  it('returns to the library from the import screen without importing', async () => {
    const user = userEvent.setup();
    await seed(['گفتگوی اول']);
    render(<App />);
    await waitForRow('گفتگوی اول');

    await user.click(addButton());
    await user.click(screen.getByRole('button', { name: 'بازگشت به کتابخانه' }));

    // Cancelling lands on a real conversation rather than a blank pane.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    // Nothing was written on the way in or out.
    expect(await db.conversations.count()).toBe(1);
  });

  it('offers no way back while the library is still empty', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(EMPTY_STATE_TITLE);

    await user.click(addButton());
    await screen.findByRole('heading', { name: IMPORT_HEADING });

    // There is no library to return to yet, so the affordance would be a dead end.
    expect(screen.queryByRole('button', { name: 'بازگشت به کتابخانه' })).not.toBeInTheDocument();
  });

  it('shows the import screen rather than the Empty State when both could apply', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(EMPTY_STATE_TITLE);

    await user.click(addButton());
    await screen.findByRole('heading', { name: IMPORT_HEADING });

    // An explicit request outranks the inferred state — the ordering the bug got
    // backwards.
    expect(screen.queryByText(EMPTY_STATE_TITLE)).not.toBeInTheDocument();
  });

  // --- Unit 13: the Sidebar's platform groups ---

  it('lands on Step 2 with the platform chosen when an empty group is clicked (FR6)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(EMPTY_STATE_TITLE);

    await user.click(screen.getByRole('button', { name: 'وارد کردن گفتگو از Gemini' }));

    // The heading proves the import screen opened; the absent Gemini chip proves
    // Step 1 was skipped — this click already answered "which platform?".
    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gemini' })).not.toBeInTheDocument();
    expect(screen.getByText('فایل خروجی گفتگو را وارد کنید')).toBeInTheDocument();
  });

  it('still opens at Step 1 from the footer action, which names no platform', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(EMPTY_STATE_TITLE);

    await user.click(addButton());

    expect(await screen.findByRole('heading', { name: IMPORT_HEADING })).toBeInTheDocument();
    // The generic entry has no platform to assume, so choosing one is Step 1.
    expect(screen.getByRole('button', { name: 'Gemini' })).toBeInTheDocument();
  });
});

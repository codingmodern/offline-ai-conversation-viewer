import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/shell/AppShell';
import { db } from '@/storage/db';
import { saveConversation } from '@/storage/conversationStore';
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
import { makeConversation, makeMessage } from '../fixtures/conversations';

/**
 * End-to-end library behaviour through the real shell, real hook and real Dexie.
 *
 * This is where FR5, FR6/FR7 and the post-delete rule (ADR #10) are proven as the
 * user experiences them: the store-level suites verify the *rules*, and this suite
 * verifies they are actually wired to the buttons.
 *
 * The database is seeded directly through `storage/` — not through file import —
 * so the assertions are about the library, not about parsing.
 */

beforeEach(async () => {
  await db.conversations.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.conversations.clear();
});

/** Seeds conversations in a known Sidebar order (newest import first). */
async function seed(titles: readonly string[]): Promise<void> {
  for (const [index, title] of titles.entries()) {
    await saveConversation(makeConversation({ sourceConversationId: `c-${String(index)}`, title }));
  }
}

/**
 * Matches a row's select button by title.
 *
 * Anchored, because the row's accessible name *begins* with the title and continues
 * with metadata, while its delete button is named "حذف <title>" — an unanchored
 * pattern matches both.
 */
function rowName(title: string): RegExp {
  return new RegExp(`^${title}`);
}

/** Waits for the sidebar's initial load to place a row on screen. */
async function waitForRow(title: string): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole('button', { name: rowName(title) }));
}

describe('AppShell library flow', () => {
  it('shows the Empty State when nothing is stored', async () => {
    render(<AppShell />);

    expect(await screen.findByText('هنوز گفتگویی ذخیره نشده است')).toBeInTheDocument();
    // The empty state offers the action that fixes it.
    expect(screen.getByRole('button', { name: 'وارد کردن فایل گفتگو' })).toBeInTheDocument();
  });

  it('lists stored conversations after loading', async () => {
    await seed(['اول', 'دوم']);
    render(<AppShell />);

    expect(await waitForRow('دوم')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('اول') })).toBeInTheDocument();
  });

  it('scrolls sidebar and conversation independently and resets content scroll on switch', async () => {
    const user = userEvent.setup();
    await saveConversation(
      makeConversation({
        sourceConversationId: 'c-a',
        title: 'اول',
        messages: [makeMessage({ content: 'پیام اول' })],
      }),
    );
    await saveConversation(
      makeConversation({
        sourceConversationId: 'c-b',
        title: 'دوم',
        messages: [makeMessage({ content: 'پیام دوم' })],
      }),
    );
    const { container } = render(<AppShell />);

    await user.click(await waitForRow('اول'));
    expect(await screen.findByText('پیام اول')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'کتابخانه‌ی گفتگوها' });
    const stage = container.querySelector('[data-conversation-id]');
    if (!(stage instanceof HTMLElement)) {
      throw new Error('The conversation scroll container was not rendered.');
    }
    const list = nav.querySelector('ul');
    if (!(list instanceof HTMLElement)) {
      throw new Error('The sidebar list was not rendered.');
    }

    // Separate scroll regions: the stage is not inside the sidebar's subtree.
    expect(nav.contains(stage)).toBe(false);

    // jsdom stores scrollTop without layout, so independence is observable:
    // scrolling one region never moves the other.
    stage.scrollTop = 300;
    list.scrollTop = 200;
    expect(stage.scrollTop).toBe(300);
    expect(list.scrollTop).toBe(200);

    const idBeforeSwitch = stage.getAttribute('data-conversation-id');
    await user.click(screen.getByRole('button', { name: rowName('دوم') }));
    expect(await screen.findByText('پیام دوم')).toBeInTheDocument();

    // The same persistent container now shows the new conversation, reset to
    // its top automatically (manual-QA FIX 2)…
    expect(stage.getAttribute('data-conversation-id')).not.toBe(idBeforeSwitch);
    expect(stage.scrollTop).toBe(0);
    // …while the sidebar's own scroll position is untouched.
    expect(list.scrollTop).toBe(200);
  });

  it('switches the active conversation without a reload (FR2/NFR2, Unit 06 themed)', async () => {
    const user = userEvent.setup();
    await saveConversation(
      makeConversation({
        sourceConversationId: 'c-a',
        title: 'اول',
        messages: [makeMessage({ content: 'پیام اول' })],
      }),
    );
    await saveConversation(
      makeConversation({
        sourceConversationId: 'c-b',
        title: 'دوم',
        messages: [makeMessage({ content: 'پیام دوم' })],
      }),
    );
    render(<AppShell />);

    await user.click(await waitForRow('اول'));

    // Unit 06: selection is proven by the themed renderer showing the selected
    // conversation's messages — the Unit 04 placeholder heading is gone.
    expect(await screen.findByText('پیام اول')).toBeInTheDocument();
    expect(document.querySelector('[data-provider-theme="deepseek"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: rowName('اول') })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Selecting the other conversation swaps the rendered messages in the same
    // document — a re-render, never a page load (FR2/NFR2).
    await user.click(screen.getByRole('button', { name: rowName('دوم') }));
    expect(await screen.findByText('پیام دوم')).toBeInTheDocument();
    expect(screen.queryByText('پیام اول')).not.toBeInTheDocument();
  });

  it('never deletes without a confirmation dialog (FR6/FR7)', async () => {
    const user = userEvent.setup();
    await seed(['ماندنی']);
    render(<AppShell />);
    await waitForRow('ماندنی');

    await user.click(screen.getByRole('button', { name: 'حذف ماندنی' }));

    // A dialog appears and the record is still there.
    expect(screen.getByRole('alertdialog', { name: 'حذف گفتگو' })).toBeInTheDocument();
    expect(await db.conversations.count()).toBe(1);
  });

  it('keeps the conversation when the delete is cancelled', async () => {
    const user = userEvent.setup();
    await seed(['ماندنی']);
    render(<AppShell />);
    await waitForRow('ماندنی');

    await user.click(screen.getByRole('button', { name: 'حذف ماندنی' }));
    await user.click(screen.getByRole('button', { name: 'انصراف' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await db.conversations.count()).toBe(1);
    expect(screen.getByRole('button', { name: rowName('ماندنی') })).toBeInTheDocument();
  });

  it('deletes only after the destructive action is chosen', async () => {
    const user = userEvent.setup();
    await seed(['رفتنی']);
    render(<AppShell />);
    await waitForRow('رفتنی');

    await user.click(screen.getByRole('button', { name: 'حذف رفتنی' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    await waitFor(async () => {
      expect(await db.conversations.count()).toBe(0);
    });
  });

  it('activates the next conversation after deleting the active one (ADR #10)', async () => {
    const user = userEvent.setup();
    // Sidebar order is newest-first: سوم, دوم, اول.
    await seed(['اول', 'دوم', 'سوم']);
    render(<AppShell />);

    await user.click(await waitForRow('دوم'));
    // Unit 06: the active conversation is proven by the themed renderer's
    // content — the placeholder heading no longer exists.
    expect(await screen.findByText('سلام')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'حذف دوم' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    // "Next" in display order after دوم is اول, which now occupies that row.
    // Unit 06: proven by aria-current plus the themed renderer's content.
    // Both signals land together once the fallback emission arrives, so assert
    // through a wait (mirrors the test below) instead of racing one render.
    await waitFor(() => {
      expect(screen.getByText('سلام')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: rowName('اول') })).toHaveAttribute(
        'aria-current',
        'true',
      );
    });
  });

  it('falls back to the previous conversation when the last row is deleted', async () => {
    const user = userEvent.setup();
    await seed(['اول', 'دوم']);
    render(<AppShell />);

    // اول is last in display order (oldest import).
    await user.click(await waitForRow('اول'));
    await user.click(screen.getByRole('button', { name: 'حذف اول' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    // Both signals land together once the fallback emission arrives, so assert
    // through a wait instead of racing one particular intermediate render.
    await waitFor(() => {
      expect(screen.getByText('سلام')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: rowName('دوم') })).toHaveAttribute(
        'aria-current',
        'true',
      );
    });
  });

  it('returns to the Empty State when the last conversation is deleted', async () => {
    const user = userEvent.setup();
    await seed(['تنها']);
    render(<AppShell />);

    await user.click(await waitForRow('تنها'));
    await user.click(screen.getByRole('button', { name: 'حذف تنها' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    expect(await screen.findByText('هنوز گفتگویی ذخیره نشده است')).toBeInTheDocument();
  });

  it('leaves the selection alone when a non-active conversation is deleted', async () => {
    const user = userEvent.setup();
    await seed(['اول', 'دوم']);
    render(<AppShell />);

    await user.click(await waitForRow('دوم'));
    await user.click(screen.getByRole('button', { name: 'حذف اول' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    // The user was reading دوم and must stay there.
    // Unit 06: proven by aria-current plus the themed renderer's content.
    expect(await screen.findByText('سلام')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('دوم') })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('names the conversation in the delete prompt and warns it is permanent', async () => {
    const user = userEvent.setup();
    await seed(['قابل حذف']);
    render(<AppShell />);
    await waitForRow('قابل حذف');

    await user.click(screen.getByRole('button', { name: 'حذف قابل حذف' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/«قابل حذف»/)).toBeInTheDocument();
    expect(within(dialog).getByText(/بازگرداندن آن ممکن نیست/)).toBeInTheDocument();
  });

  it('empties the library only after exactly one confirmation (ADR #14)', async () => {
    const user = userEvent.setup();
    await seed(['اول', 'دوم']);
    render(<AppShell />);
    await waitForRow('اول');

    await user.click(screen.getByRole('button', { name: 'حذف همه‌ی گفتگوها' }));

    // ONE dialog for the whole batch — never one per conversation — and it states
    // plainly that nothing can be recovered.
    const dialogs = screen.getAllByRole('alertdialog');
    expect(dialogs).toHaveLength(1);
    const prompt = dialogs[0];
    if (!prompt) {
      throw new Error('Confirmation dialog was not rendered.');
    }
    expect(within(prompt).getByText(/قابل بازگشت نیست/)).toBeInTheDocument();
    expect(await db.conversations.count()).toBe(2);

    // Cancelling leaves the library byte-identical.
    await user.click(within(prompt).getByRole('button', { name: 'انصراف' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(await db.conversations.count()).toBe(2);
    expect(screen.getByRole('button', { name: rowName('اول') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rowName('دوم') })).toBeInTheDocument();
  });

  it('shows the genuine Empty State after confirming the bulk clear (ADR #14)', async () => {
    const user = userEvent.setup();
    await seed(['اول', 'دوم']);
    render(<AppShell />);
    await waitForRow('اول');

    await user.click(screen.getByRole('button', { name: 'حذف همه‌ی گفتگوها' }));
    await user.click(screen.getByRole('button', { name: 'همه را حذف کن' }));

    // entries.length === 0 is the real emptiness path, not a fallback: the same
    // state a fresh visitor sees, with its own call to action.
    expect(await screen.findByText('هنوز گفتگویی ذخیره نشده است')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: rowName('اول') })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: rowName('دوم') })).not.toBeInTheDocument();
    expect(await db.conversations.count()).toBe(0);
  });

  it('surfaces the stored metadata of the active record in the panel when it is opened (Unit 05)', async () => {
    const user = userEvent.setup();
    await saveConversation(
      makeConversation({
        sourceConversationId: 'meta-1',
        title: 'متادیتادار',
        createdAt: '2026-05-01T09:30:00Z',
        updatedAt: '2026-06-01T11:00:00Z',
        messages: [makeMessage(), makeMessage({ order: 1 })],
      }),
    );
    render(<AppShell />);

    await user.click(await waitForRow('متادیتادار'));

    const panel = await screen.findByRole('region', { name: 'اطلاعات مکالمه' });
    // The metadata panel is collapsed by default (post-Unit-06, ADR #20);
    // open it before asserting on its rows.
    await user.click(within(panel).getByRole('button', { name: 'اطلاعات مکالمه' }));
    expect(within(panel).getByText('متادیتادار')).toBeInTheDocument();
    expect(within(panel).getByText('تاریخ ایجاد')).toBeInTheDocument();
    expect(within(panel).getByText('آخرین به‌روزرسانی')).toBeInTheDocument();
    expect(within(panel).getByText('DeepSeek')).toBeInTheDocument();
    // FR2: the count is always a plain integer — here, 2.
    expect(within(panel).getByText('2')).toBeInTheDocument();
    // Unit 06: the themed conversation renderer renders beside the panel.
    expect(document.querySelector('[data-provider-theme="deepseek"]')).not.toBeNull();
    expect(screen.getAllByText('سلام').length).toBeGreaterThan(0);
  });

  it('removes the deleted row from the sidebar without a reload', async () => {
    const user = userEvent.setup();
    await seed(['اول', 'دوم']);
    render(<AppShell />);
    await waitForRow('اول');

    await user.click(screen.getByRole('button', { name: 'حذف اول' }));
    await user.click(screen.getByRole('button', { name: 'حذف گفتگو' }));

    // The live subscription refreshes the list in place.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: rowName('اول') })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: rowName('دوم') })).toBeInTheDocument();
  });
});

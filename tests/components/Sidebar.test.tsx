import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/library/Sidebar';
import type { UseConversationSearchResult } from '@/features/search/useConversationSearch';
// Kept one level deep: `@/` maps to `src`, and deeper relative paths are banned
// by `code-standards.md` §2.1, so fixture-loading tests stay flat.
import { makeEntry } from '../fixtures/conversations';

/**
 * Sidebar interaction (FR4/FR5/FR6).
 *
 * Rendered with plain props and no database: the Sidebar must be provably free of
 * storage access (FR3), so if these tests needed IndexedDB the layering would be
 * wrong. Queries go through roles and accessible names, so they fail if the markup
 * stops being operable by keyboard or screen reader.
 */

/** Fresh no-op search slice per render, since plain `vi.fn()`s accumulate calls. */
function makeNoopSearch(): UseConversationSearchResult {
  return {
    query: '',
    isSearching: false,
    isIndexReady: true,
    matchedIds: [],
    setQuery: vi.fn(),
    clearQuery: vi.fn(),
  };
}

const entries = [
  makeEntry({ id: 1, title: 'گفتگوی اول', messageCount: 3 }),
  makeEntry({ id: 2, title: 'گفتگوی دوم', messageCount: 7 }),
];

/**
 * Matches a row's select button by title.
 *
 * Anchored, because a row's accessible name *starts* with the title and continues
 * with its metadata ("گفتگوی اول DeepSeek · 3 پیام · …"), while its delete button is
 * named "حذف گفتگوی اول". An unanchored pattern would match both.
 */
function rowName(title: string): RegExp {
  return new RegExp(`^${title}`);
}

/** Renders with sensible defaults so each test overrides only what it asserts on. */
function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}): {
  readonly onSelect: ReturnType<typeof vi.fn>;
  readonly onRequestDelete: ReturnType<typeof vi.fn>;
  readonly onRequestClearAll: ReturnType<typeof vi.fn>;
  readonly onImportClick: ReturnType<typeof vi.fn>;
} {
  const onSelect = vi.fn();
  const onRequestDelete = vi.fn();
  const onRequestClearAll = vi.fn();
  const onImportClick = vi.fn();

  render(
    <Sidebar
      entries={entries}
      activeId={undefined}
      isLoading={false}
      search={makeNoopSearch()}
      onSelect={onSelect}
      onRequestDelete={onRequestDelete}
      onRequestClearAll={onRequestClearAll}
      onImportClick={onImportClick}
      {...overrides}
    />,
  );

  return { onSelect, onRequestDelete, onRequestClearAll, onImportClick };
}

describe('Sidebar', () => {
  beforeEach(() => {
    // Unit 13: group collapse is a real localStorage preference, and jsdom keeps
    // it for the whole file. Without this, whichever test collapsed a group
    // first would hide its rows from every test after it — and the suite would
    // be testing storage rather than the Sidebar.
    window.localStorage.clear();
  });

  it('lists every stored conversation by title', () => {
    renderSidebar();

    expect(screen.getByText('گفتگوی اول')).toBeInTheDocument();
    expect(screen.getByText('گفتگوی دوم')).toBeInTheDocument();
  });

  it('shows the platform and message count for each row (FR4)', () => {
    renderSidebar();

    // Three now, not two: the Unit 13 group header states the platform once for
    // the bucket, and each row's meta line still states it for itself. The header
    // is the reason grouping is legible; the meta is why a row still makes sense
    // read on its own.
    expect(screen.getAllByText('DeepSeek')).toHaveLength(3);
    expect(screen.getByText('3 پیام')).toBeInTheDocument();
  });

  it('labels an untitled conversation instead of rendering an empty row', () => {
    renderSidebar({ entries: [makeEntry({ id: 9 })] });

    expect(screen.getByText('گفتگوی بی‌عنوان')).toBeInTheDocument();
  });

  it('reports the clicked conversation to its parent', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderSidebar();

    await user.click(screen.getByRole('button', { name: rowName('گفتگوی دوم') }));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('marks the active conversation with aria-current, not colour alone', () => {
    renderSidebar({ activeId: 2 });

    const active = screen.getByRole('button', { name: rowName('گفتگوی دوم') });
    expect(active).toHaveAttribute('aria-current', 'true');
    // Exactly one row may claim the current state.
    expect(screen.getByRole('button', { name: rowName('گفتگوی اول') })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('is operable by keyboard alone (`ui-context.md` §6)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderSidebar();

    // Tab reaches the header's language toggle options first (Unit 12), then the
    // Unit 07 search field, then the platform group's header — a real toggle
    // button since Unit 13 (FR4) — and then the first row, which Enter activates.
    // Asserting the group header explicitly matters: a stop that is *not* there
    // (or not a button) would shift every later stop by one and mask a break.
    await user.tab();
    expect(screen.getByRole('button', { name: 'فارسی' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'English' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^DeepSeek/ })).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('requests deletion without deleting anything itself (FR6)', async () => {
    const user = userEvent.setup();
    const { onRequestDelete, onSelect } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'حذف گفتگوی اول' }));

    // Only a request is emitted — and it must not also change the selection.
    expect(onRequestDelete).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('names each delete button after its conversation', () => {
    renderSidebar();

    // Distinct accessible names: a screen-reader user must know which row is which.
    expect(screen.getByRole('button', { name: 'حذف گفتگوی اول' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف گفتگوی دوم' })).toBeInTheDocument();
  });

  it('requests the bulk clear without deleting anything itself (ADR #14)', async () => {
    const user = userEvent.setup();
    const { onRequestClearAll, onSelect } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'حذف همه‌ی گفتگوها' }));

    // Only a request is emitted — the one dialog at shell level decides — and it
    // must not also change the selection.
    expect(onRequestClearAll).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers the clear-all action when rows exist', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: 'حذف همه‌ی گفتگوها' })).toBeInTheDocument();
  });

  it('hides the clear-all action on an empty library', () => {
    // An empty library has nothing to delete, so the destructive control hides
    // instead of inviting a guaranteed no-op (or a confusing prompt).
    render(
      <Sidebar
        entries={[]}
        activeId={undefined}
        isLoading={false}
        search={makeNoopSearch()}
        onSelect={vi.fn()}
        onRequestDelete={vi.fn()}
        onRequestClearAll={vi.fn()}
        onImportClick={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'حذف همه‌ی گفتگوها' })).not.toBeInTheDocument();
  });

  it('offers an import action at all times', async () => {
    const user = userEvent.setup();
    const { onImportClick } = renderSidebar();

    await user.click(screen.getByRole('button', { name: '+ افزودن گفتگو' }));

    expect(onImportClick).toHaveBeenCalled();
  });

  it('distinguishes loading from empty', () => {
    const noop = vi.fn();
    const { unmount } = render(
      <Sidebar
        entries={[]}
        activeId={undefined}
        isLoading
        search={makeNoopSearch()}
        onSelect={noop}
        onRequestDelete={noop}
        onRequestClearAll={noop}
        onImportClick={noop}
      />,
    );

    expect(screen.getByText('در حال بارگذاری…')).toBeInTheDocument();
    // An empty library is a different message, so a slow read never reads as data loss.
    expect(screen.queryByText('هنوز گفتگویی ذخیره نشده است.')).not.toBeInTheDocument();
    unmount();

    renderSidebar({ entries: [] });
    expect(screen.getByText('هنوز گفتگویی ذخیره نشده است.')).toBeInTheDocument();
  });

  it('exposes the list as a labelled navigation region', () => {
    renderSidebar();

    expect(screen.getByRole('navigation', { name: 'کتابخانه‌ی گفتگوها' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  // --- Unit 13: platform-grouped sidebar ---

  it('shows all four platform groups even when the library is empty (FR1)', () => {
    renderSidebar({ entries: [] });

    // Each group is a labelled `<section>`, so counting regions is counting
    // groups — including the four that have nothing in them yet.
    for (const platform of ['ChatGPT', 'Claude', 'DeepSeek', 'Gemini']) {
      expect(screen.getByRole('region', { name: platform })).toBeInTheDocument();
    }

    // FR2: an empty group still states its count instead of hiding it.
    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('toggles a group from its header and remembers the choice (FR4)', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const header = screen.getByRole('button', { name: /^DeepSeek/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: rowName('گفتگوی اول') })).toBeInTheDocument();

    await user.click(header);

    // ARIA state, not just a class — and the rows leave the accessibility tree
    // with it, because a collapsed body is `hidden`.
    expect(screen.getByRole('button', { name: /^DeepSeek/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: rowName('گفتگوی اول') })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('app-library-group-collapse') ?? '{}')).toEqual({
      deepseek: true,
    });
  });

  it('restores a collapsed group on the next visit (FR4)', () => {
    window.localStorage.setItem('app-library-group-collapse', JSON.stringify({ deepseek: true }));

    renderSidebar();

    expect(screen.getByRole('button', { name: /^DeepSeek/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: rowName('گفتگوی اول') })).not.toBeInTheDocument();
  });

  it('opens every group when the stored collapse state is corrupt (spec Validation)', () => {
    window.localStorage.setItem('app-library-group-collapse', '{not json');

    renderSidebar();

    expect(screen.getByRole('button', { name: /^DeepSeek/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: rowName('گفتگوی اول') })).toBeInTheDocument();
  });

  it('offers that platform\'s import flow from an empty group (FR6)', async () => {
    const user = userEvent.setup();
    const { onImportClick } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'وارد کردن گفتگو از Gemini' }));

    // The platform travels with the request — that is what lets the flow skip
    // Step 1 instead of asking the user a question the click already answered.
    expect(onImportClick).toHaveBeenCalledWith('gemini');
  });

  it('keeps the footer action generic, so it still starts at Step 1 (FR6)', async () => {
    const user = userEvent.setup();
    const { onImportClick } = renderSidebar();

    await user.click(screen.getByRole('button', { name: '+ افزودن گفتگو' }));

    expect(onImportClick).toHaveBeenCalledWith();
  });
});

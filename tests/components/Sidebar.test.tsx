import { describe, expect, it, vi } from 'vitest';
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
  it('lists every stored conversation by title', () => {
    renderSidebar();

    expect(screen.getByText('گفتگوی اول')).toBeInTheDocument();
    expect(screen.getByText('گفتگوی دوم')).toBeInTheDocument();
  });

  it('shows the platform and message count for each row (FR4)', () => {
    renderSidebar();

    expect(screen.getAllByText('DeepSeek')).toHaveLength(2);
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
    // Unit 07 search field, then the first row (a real button), and Enter activates it.
    await user.tab();
    expect(screen.getByRole('button', { name: 'فارسی' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'English' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('searchbox')).toHaveFocus();
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
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/library/Sidebar';
import type { UseConversationSearchResult } from '@/features/search/useConversationSearch';
import { makeEntry } from '../fixtures/conversations';

/**
 * The Sidebar's search swap (Unit 07 UI Behaviour): one boolean branch between
 * the normal list and the result view, selection still flowing through the same
 * `onSelect` the list rows use (FR4), clearing restoring the full view (FR7),
 * zero results a state rather than an error (FR8).
 */

const entries = [
  makeEntry({ id: 1, title: 'گفتگوی اول', messageCount: 3 }),
  makeEntry({ id: 2, title: 'گفتگوی دوم', messageCount: 7 }),
];

function makeSearch(overrides: Partial<UseConversationSearchResult> = {}): UseConversationSearchResult {
  return {
    query: '',
    isSearching: false,
    isIndexReady: true,
    matchedIds: [],
    setQuery: vi.fn(),
    clearQuery: vi.fn(),
    ...overrides,
  };
}

interface RenderOptions {
  readonly search?: UseConversationSearchResult;
  readonly onSelect?: ReturnType<typeof vi.fn>;
}

function renderSidebar(options: RenderOptions = {}): void {
  render(
    <Sidebar
      entries={entries}
      activeId={undefined}
      isLoading={false}
      search={options.search ?? makeSearch()}
      onSelect={options.onSelect ?? vi.fn()}
      onRequestDelete={vi.fn()}
      onRequestClearAll={vi.fn()}
      onImportClick={vi.fn()}
    />,
  );
}

describe('Sidebar → in-chat search (Unit 07)', () => {
  it('keeps offering the normal list, with no result view, while not searching', () => {
    renderSidebar();

    expect(screen.getByRole('button', { name: /^گفتگوی اول/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^گفتگوی دوم/ })).toBeInTheDocument();
    // No stray status region when there is nothing to report:
    expect(screen.queryByText(/نتیجه/)).not.toBeInTheDocument();
  });

  it('shows result rows instead of the list while a term is active', () => {
    renderSidebar({ search: makeSearch({ query: 'اول', isSearching: true, matchedIds: [1] }) });

    expect(screen.getByText('1 نتیجه برای «اول»')).toBeInTheDocument();
    // The non-matching conversation's row must be gone:
    expect(screen.queryByRole('button', { name: /^گفتگوی دوم/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^گفتگوی اول/ })).toBeInTheDocument();
  });

  it('sends keystrokes to the injected search slice, owning none itself', async () => {
    const user = userEvent.setup();
    const setQuery = vi.fn();
    renderSidebar({ search: makeSearch({ setQuery }) });

    await user.type(screen.getByRole('searchbox'), 'ق');

    expect(setQuery).toHaveBeenCalledWith('ق');
  });

  it('opens a result through the same onSelect path as a normal row (FR4)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSidebar({
      search: makeSearch({ query: 'اول', isSearching: true, matchedIds: [1] }),
      onSelect,
    });

    await user.click(screen.getByRole('button', { name: /^گفتگوی اول/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('reports zero results as a status note, never as an error (FR8)', () => {
    renderSidebar({ search: makeSearch({ query: 'ناموجود', isSearching: true }) });

    expect(screen.getByText('نتیجه‌ای برای «ناموجود» پیدا نشد.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('brings the full list back once the term clears (FR7)', () => {
    const { rerender } = render(
      <Sidebar
        entries={entries}
        activeId={undefined}
        isLoading={false}
        search={makeSearch({ query: 'اول', isSearching: true, matchedIds: [1] })}
        onSelect={vi.fn()}
        onRequestDelete={vi.fn()}
        onRequestClearAll={vi.fn()}
        onImportClick={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^گفتگوی دوم/ })).not.toBeInTheDocument();

    rerender(
      <Sidebar
        entries={entries}
        activeId={undefined}
        isLoading={false}
        search={makeSearch()}
        onSelect={vi.fn()}
        onRequestDelete={vi.fn()}
        onRequestClearAll={vi.fn()}
        onImportClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^گفتگوی دوم/ })).toBeInTheDocument();
  });

  it('wires Escape-free clearing too: the ✕ calls clearQuery (FR7)', async () => {
    const user = userEvent.setup();
    const clearQuery = vi.fn();
    renderSidebar({ search: makeSearch({ query: 'اول', isSearching: true, clearQuery }) });

    await user.click(screen.getByRole('button', { name: 'پاک کردن جستجو' }));

    expect(clearQuery).toHaveBeenCalledTimes(1);
  });
});

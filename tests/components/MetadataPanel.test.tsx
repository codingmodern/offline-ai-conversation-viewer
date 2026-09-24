import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MetadataPanel } from '@/components/library/MetadataPanel';
import {
  CONVERSATION_METADATA_FIELDS,
  resolveMetadataFields,
  type ConversationFieldDescriptor,
} from '@/features/library/metadataFields';
import { makeConversation } from '../fixtures/conversations';

/**
 * Component-level proof of the Metadata Panel's contract
 * (`05-conversation-metadata.md` → Acceptance Criteria). Field resolution is
 * exercised in `tests/features/metadataFields.test.ts`; these tests prove the
 * *rendering* side: present fields appear, absent fields never leave a trace,
 * and the always-on facts survive every case.
 *
 * Post-Unit-06 (ADR #20): the panel is **collapsed by default** — every test
 * that needs the field list must call `expandPanel()` first. New tests pin
 * the collapsed default and the platform-icon affordance.
 */

type ConversationFixtureOptions = NonNullable<Parameters<typeof makeConversation>[0]>;

/** Renders the panel for a conversation through the real descriptor list. */
function renderPanel(
  conversation: ConversationFixtureOptions,
  overrides: { messageCount?: number; fields?: readonly ConversationFieldDescriptor[] } = {},
): void {
  const fields = resolveMetadataFields(makeConversation(conversation), overrides.fields);
  render(
    <MetadataPanel
      fields={fields}
      messageCount={overrides.messageCount ?? conversation.messages?.length ?? 1}
      platform="deepseek"
    />,
  );
}

/** Opens the panel by clicking its toggle heading. */
function expandPanel(): void {
  fireEvent.click(screen.getByRole('button', { name: 'اطلاعات مکالمه' }));
}

describe('MetadataPanel', () => {
  it('is collapsed by default — the field list is not in the DOM', () => {
    renderPanel({ title: 'گفتگوی کامل' });

    const toggle = screen.getByRole('button', { name: 'اطلاعات مکالمه' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The <dl> is conditional, so absent from the DOM until expanded. There
    // is no `list` role on a native <dl>, so the assertion uses the tag.
    expect(document.querySelector('dl')).toBeNull();
    // Field labels live inside the (unrendered) list.
    expect(screen.queryByText('عنوان')).toBeNull();
  });

  it('expands the list on toggle and collapses it again', () => {
    renderPanel({ title: 'گفتگوی کامل' });

    const toggle = screen.getByRole('button', { name: 'اطلاعات مکالمه' });
    expandPanel();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('dl')).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('dl')).toBeNull();
  });

  it('renders the platform brand icon next to the platform name in the platform row', () => {
    renderPanel({});
    expandPanel();

    const platformRow = screen.getByText('پلتفرم').closest('[data-field="platform"]');
    expect(platformRow).not.toBeNull();
    // The platform name still drives the accessible name (svg is aria-hidden).
    expect(within(platformRow as HTMLElement).getByText('DeepSeek')).toBeInTheDocument();
    // The shared PlatformIcon SVG sits inside the same row.
    const svg = (platformRow as HTMLElement).querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('shows every available field plus platform and message count (full metadata)', () => {
    renderPanel({
      title: 'گفتگوی کامل',
      createdAt: '2026-01-02T10:30:00Z',
      updatedAt: '2026-02-03T08:00:00Z',
    });
    expandPanel();

    const panel = screen.getByRole('region', { name: 'اطلاعات مکالمه' });
    expect(within(panel).getByText('گفتگوی کامل')).toBeInTheDocument();
    expect(within(panel).getByText('تاریخ ایجاد')).toBeInTheDocument();
    expect(within(panel).getByText('آخرین به‌روزرسانی')).toBeInTheDocument();
    expect(within(panel).getByText('DeepSeek')).toBeInTheDocument();
    expect(within(panel).getByText('1')).toBeInTheDocument();
  });

  it('renders only the fields that exist — no placeholder rows for absent ones (FR4)', () => {
    renderPanel({ title: 'فقط عنوان' });
    expandPanel();

    const panel = screen.getByRole('region', { name: 'اطلاعات مکالمه' });
    expect(within(panel).getByText('عنوان')).toBeInTheDocument();
    expect(within(panel).queryByText('تاریخ ایجاد')).not.toBeInTheDocument();
    expect(within(panel).queryByText('آخرین به‌روزرسانی')).not.toBeInTheDocument();

    // No value cell is left empty or filled with a dash-style placeholder.
    const values = Array.from(panel.querySelectorAll('dd'));
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.textContent).not.toBe('');
      expect(value.textContent).not.toBe('—');
    }
  });

  it('still shows platform and count when no optional metadata exists', () => {
    renderPanel({}, { messageCount: 7 });
    expandPanel();

    const panel = screen.getByRole('region', { name: 'اطلاعات مکالمه' });
    expect(within(panel).queryByText('عنوان')).not.toBeInTheDocument();
    expect(within(panel).getByText('DeepSeek')).toBeInTheDocument();
    expect(within(panel).getByText('7')).toBeInTheDocument();
    // Exactly the two always-on facts remain: پلتفرم + تعداد پیام‌ها.
    expect(panel.querySelectorAll('dd')).toHaveLength(2);
  });

  it('treats an empty conversation as valid, showing a count of 0 (FR2)', () => {
    renderPanel({ messages: [] }, { messageCount: 0 });
    expandPanel();

    const panel = screen.getByRole('region', { name: 'اطلاعات مکالمه' });
    expect(within(panel).getByText('0')).toBeInTheDocument();
    expect(within(panel).getByText('DeepSeek')).toBeInTheDocument();
  });

  it('renders an appended future field without any change to this component (FR3/NFR2)', () => {
    // Simulates tomorrow's descriptor addition — the component under test is
    // untouched; only the resolved list grows.
    const futureField: ConversationFieldDescriptor = {
      key: 'sourceConversationId',
      label: 'شناسه‌ی مکالمه',
      accessor: (conversation) => conversation.sourceConversationId,
    };

    renderPanel({}, { fields: [...CONVERSATION_METADATA_FIELDS, futureField] });
    expandPanel();

    const panel = screen.getByRole('region', { name: 'اطلاعات مکالمه' });
    expect(within(panel).getByText('شناسه‌ی مکالمه')).toBeInTheDocument();
    expect(within(panel).getByText('conv-1')).toBeInTheDocument();
  });
});

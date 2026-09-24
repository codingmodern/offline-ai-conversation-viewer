import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_METADATA_FIELDS,
  resolveMetadataFields,
  type ConversationFieldDescriptor,
} from '@/features/library/metadataFields';
import { makeConversation } from '../fixtures/conversations';

/**
 * The descriptor list is Unit 05's FR3/NFR2 mechanism: fields are declared as
 * data, resolved by one pure function, and absent fields contribute nothing.
 * These tests pin that contract independently of any component.
 */
describe('resolveMetadataFields', () => {
  it('resolves every present field for a fully-described conversation', () => {
    const conversation = makeConversation({
      title: 'گفتگوی کامل',
      createdAt: '2026-01-02T10:30:00Z',
      updatedAt: '2026-02-03T08:00:00Z',
    });

    const fields = resolveMetadataFields(conversation);

    expect(fields.map((field) => field.key)).toEqual(['title', 'createdAt', 'updatedAt']);
    expect(fields[0]).toMatchObject({ label: 'عنوان', value: 'گفتگوی کامل' });
    expect(fields[1]?.label).toBe('تاریخ ایجاد');
    expect(fields[2]?.label).toBe('آخرین به‌روزرسانی');
  });

  it('skips absent fields silently instead of producing placeholder rows (FR4)', () => {
    // `makeConversation` omits what is not supplied — exactly the partial case.
    const conversation = makeConversation({ title: 'فقط عنوان' });

    const fields = resolveMetadataFields(conversation);

    expect(fields.map((field) => field.key)).toEqual(['title']);
  });

  it('resolves to nothing when no optional metadata exists at all', () => {
    const conversation = makeConversation();

    expect(resolveMetadataFields(conversation)).toEqual([]);
  });

  it('drops an entry whose accessor returns null without breaking later entries', () => {
    const fields: readonly ConversationFieldDescriptor[] = [
      { key: 'absent', label: 'غایب', accessor: () => null },
      ...CONVERSATION_METADATA_FIELDS,
    ];

    const resolved = resolveMetadataFields(makeConversation({ title: 'عنوان' }), fields);

    expect(resolved.map((field) => field.key)).toEqual(['title']);
  });

  it('renders a future field appended to the descriptor list with no component change (FR3/NFR2)', () => {
    // Simulates tomorrow's change: ONE new entry, existing descriptors untouched.
    const futureField: ConversationFieldDescriptor = {
      key: 'sourceConversationId',
      label: 'شناسه‌ی مکالمه',
      accessor: (conversation) => conversation.sourceConversationId,
    };
    const extended = [...CONVERSATION_METADATA_FIELDS, futureField];

    const resolved = resolveMetadataFields(makeConversation(), extended);

    expect(resolved.at(-1)).toMatchObject({ key: 'sourceConversationId', value: 'conv-1' });
  });

  it('formats declared date fields for the Persian locale but never invents a date', () => {
    const resolved = resolveMetadataFields(
      makeConversation({
        title: 'گفتگو',
        createdAt: '2026-01-02T10:30:00Z',
        updatedAt: 'not-a-date',
      }),
    );

    // Looked up by key (never by position) so the assertion targets the field,
    // not wherever it happens to sit in the list.
    const createdAt = resolved.find((field) => field.key === 'createdAt');
    const updatedAt = resolved.find((field) => field.key === 'updatedAt');

    // Reformatted to a Jalali date rather than shown as raw ISO…
    expect(createdAt).toBeDefined();
    expect(createdAt?.value).not.toBe('2026-01-02T10:30:00Z');
    // fa-IR renders Extended Arabic-Indic digits, so the year check must match
    // Persian digits explicitly (`\d` only matches ASCII and would never hit).
    expect(createdAt?.value).toMatch(/۱۴۰[۰-۹]/);
    // …while an unparseable export value stays verbatim — nothing fabricated.
    expect(updatedAt?.value).toBe('not-a-date');
  });

  it('keeps messageCount out of the optional-field list (FR2: structural, always shown)', () => {
    expect(CONVERSATION_METADATA_FIELDS.map((field) => field.key)).not.toContain('messageCount');
  });

  it('surfaces the Claude summary row first when the export records one (Unit 09)', () => {
    const conversation = makeConversation({
      title: 'عنوان',
      summary: 'خلاصه‌ای که پلتفرم ثبت کرده است.',
      createdAt: '2026-08-30T00:20:01Z',
      updatedAt: '2026-08-30T00:23:03Z',
    });

    const fields = resolveMetadataFields(conversation);

    expect(fields.map((field) => field.key)).toEqual([
      'summary',
      'title',
      'createdAt',
      'updatedAt',
    ]);
    expect(fields[0]).toMatchObject({ label: 'خلاصه', value: 'خلاصه‌ای که پلتفرم ثبت کرده است.' });
  });

  it('drops the summary row for exports without one (verbatim-presence rule)', () => {
    const conversation = makeConversation({ title: 'فقط عنوان' });

    expect(resolveMetadataFields(conversation).map((field) => field.key)).toEqual(['title']);
  });
});

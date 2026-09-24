import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConversationStage } from '@/components/shell/ConversationStage';
import { db } from '@/storage/db';
import { saveConversation } from '@/storage/conversationStore';
import type { UnifiedConversation } from '@/types/conversation';
import { makeConversation, makeEntry, makeMessage } from '../fixtures/conversations';

/**
 * Shell-level behaviour of the stage around the themed view: dispatch, the
 * brief read window, and the manual-QA scroll contract — the stage is the
 * content area's independent scroll container and its position resets to the
 * top whenever the displayed record's identity changes.
 */

/** Seeds one conversation and returns its assigned library id. */
async function seed(options: Parameters<typeof makeConversation>[0]): Promise<{ readonly id: number }> {
  const conversation = makeConversation(options);
  const saved = await saveConversation(conversation);
  if (!saved.ok || saved.data.status !== 'saved') {
    throw new Error(`Seeding failed for ${conversation.sourceConversationId}.`);
  }
  return { id: saved.data.id };
}

/** Waits out React-external async work so pending state updates land inside act. */
async function flushAsync(ms = 250): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

function stageOf(container: HTMLElement): HTMLElement {
  const stage = container.querySelector('[data-conversation-id]');
  if (!(stage instanceof HTMLElement)) {
    throw new Error('The conversation scroll container was not rendered.');
  }
  return stage;
}

describe('ConversationStage', () => {
  beforeEach(async () => {
    await db.conversations.clear();
  });

  afterEach(async () => {
    await db.conversations.clear();
  });

  it('renders the themed view once the record resolves', async () => {
    const record = await seed({
      sourceConversationId: 'c-1',
      messages: [makeMessage({ content: 'پیام' })],
    });

    const { container } = render(<ConversationStage entry={makeEntry({ id: record.id })} />);

    await flushAsync();
    expect(screen.getByText('پیام')).toBeInTheDocument();
    expect(container.querySelector('[data-provider-theme="deepseek"]')).not.toBeNull();
  });

  it('dispatches the Gemini theme for a Gemini record (Unit 10)', async () => {
    // The store derives `platform` from `sourceProvider`, so a Gemini record
    // reaches the stage with platform 'gemini' — one more case in the shell's
    // single dispatch point.
    const conversation: UnifiedConversation = {
      ...makeConversation({
        sourceConversationId: 'g-1',
        messages: [makeMessage({ content: 'پیام گمینی' })],
      }),
      sourceProvider: 'gemini',
    };
    const saved = await saveConversation(conversation);
    if (!saved.ok || saved.data.status !== 'saved') {
      throw new Error('Seeding the Gemini record failed.');
    }

    const { container } = render(
      <ConversationStage entry={{ ...makeEntry({ id: saved.data.id }), platform: 'gemini' }} />,
    );

    await flushAsync();
    expect(screen.getByText('پیام گمینی')).toBeInTheDocument();
    expect(container.querySelector('[data-provider-theme="gemini"]')).not.toBeNull();
  });

  it('dispatches the ChatGPT theme for a ChatGPT record (Unit 11b)', async () => {
    // Same contract as the Gemini case: the record's own `sourceProvider`
    // decides the platform, so the seeded conversation must carry it too —
    // otherwise the store's `platform` derivation would disagree with the
    // entry's override and the dispatch would target the wrong theme.
    const conversation: UnifiedConversation = {
      ...makeConversation({
        sourceConversationId: 'cg-1',
        messages: [makeMessage({ content: 'پیام چت‌جی‌پی‌تی' })],
      }),
      sourceProvider: 'chatgpt',
    };
    const saved = await saveConversation(conversation);
    if (!saved.ok || saved.data.status !== 'saved') {
      throw new Error('Seeding the ChatGPT record failed.');
    }

    const { container } = render(
      <ConversationStage entry={{ ...makeEntry({ id: saved.data.id }), platform: 'chatgpt' }} />,
    );

    await flushAsync();
    expect(screen.getByText('پیام چت‌جی‌پی‌تی')).toBeInTheDocument();
    expect(container.querySelector('[data-provider-theme="chatgpt"]')).not.toBeNull();
  });

  it('keeps the bounded region while nothing could be resolved', async () => {
    const { container } = render(<ConversationStage entry={makeEntry({ id: 999 })} />);

    // No such id → an empty read (`getConversation` contract): the stage
    // persists as the bounded region, with no themed content inside.
    await flushAsync(100);
    expect(stageOf(container)).toBeTruthy();
    expect(container.querySelector('[data-provider-theme="deepseek"]')).toBeNull();
  });

  it('resets the content scroll position to the top when the conversation changes', async () => {
    const first = await seed({
      sourceConversationId: 'c-1',
      messages: [makeMessage({ content: 'مکالمه‌ی اول' })],
    });
    const second = await seed({
      sourceConversationId: 'c-2',
      messages: [makeMessage({ content: 'مکالمه‌ی دوم' })],
    });

    const { container, rerender } = render(
      <ConversationStage entry={makeEntry({ id: first.id })} />,
    );
    await flushAsync();
    expect(screen.getByText('مکالمه‌ی اول')).toBeInTheDocument();

    const stage = stageOf(container);
    // jsdom stores scrollTop without layout, so the assignment is observable.
    stage.scrollTop = 400;
    expect(stage.scrollTop).toBe(400);

    rerender(<ConversationStage entry={makeEntry({ id: second.id })} />);
    await flushAsync();

    // Same DOM node (the container persists across switches), but its position
    // was reset by the identity-keyed effect — the new conversation opens at
    // its start without manual scrolling.
    expect(stage.scrollTop).toBe(0);
    expect(await screen.findByText('مکالمه‌ی دوم')).toBeInTheDocument();
  });
});

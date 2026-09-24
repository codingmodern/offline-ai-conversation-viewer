import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { UnifiedConversation } from '@/types/conversation';
import type { LibraryEntry } from '@/types/storage';
import { useActiveConversation } from '@/features/library/useActiveConversation';
import { DeepSeekConversationView } from '@/themes/deepseek/DeepSeekConversationView';
import { ClaudeConversationView } from '@/themes/claude/ClaudeConversationView';
import { GeminiConversationView } from '@/themes/gemini/GeminiConversationView';
import { ChatGPTConversationView } from '@/themes/chatgpt/ChatGPTConversationView';
import styles from './ConversationStage.module.css';

interface ConversationStageProps {
  readonly entry: LibraryEntry;
}

/**
 * Renders the active platform's themed conversation inside the content area's
 * own independent scroll region.
 *
 * The scroll container deliberately lives HERE, in the shell, rather than in
 * any theme's view: it is pure layout policy (`ui-context.md` §3 — the metadata
 * panel sits above the conversation region and stays put while messages
 * scroll), so every future theme inherits correct scrolling and reset behavior
 * for free and cannot get it wrong (FR5/NFR3).
 *
 * On selection change the container's `scrollTop` resets to 0 keyed on the
 * displayed record's identity: the container persists across switches (so the
 * themed output swaps in place, FR2/NFR2), which means its scroll position
 * would otherwise survive into the newly opened conversation.
 */
export function ConversationStage({ entry }: ConversationStageProps): JSX.Element {
  const { conversation } = useActiveConversation(entry.id);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect((): void => {
    const container = scrollRef.current;
    if (container !== null) {
      container.scrollTop = 0;
    }
  }, [entry.id]);

  return (
    <div
      ref={scrollRef}
      className={styles.stage}
      data-conversation-id={entry.id}
    >
      {renderThemeView(entry.platform, conversation)}
    </div>
  );

  /**
   * The single point in the shell that knows which provider themes exist
   * (`code-standards.md` §3 → Theme Injection: shared components never
   * hardcode provider logic — this dispatch *is* the shell's whole theme
   * awareness).
   *
   * Adding a platform's theme later means one new `themes/{provider}/` folder
   * and one case here; no existing theme file changes (Unit 06 FR5/NFR3). The
   * switch is exhaustive over `ProviderId`, so no default branch exists — an
   * unregistered platform cannot reach the library because detection is the
   * only writer (`ui-context.md` §4.2 → Fallback).
   */
  function renderThemeView(
    platform: LibraryEntry['platform'],
    resolved: UnifiedConversation | undefined,
  ): JSX.Element {
    switch (platform) {
      case 'deepseek':
        // While the record is being read (or degraded away), the region is
        // deliberately empty: the previous conversation's content already left
        // on selection change, so the switch is visibly in-place — no reload
        // (FR2/NFR2) — and no stale content flashes.
        return resolved === undefined ? (
          <div className={styles.loading} aria-hidden="true" />
        ) : (
          <DeepSeekConversationView conversation={resolved} />
        );
      case 'claude':
        // Same contract, Claude's theme (Unit 09).
        return resolved === undefined ? (
          <div className={styles.loading} aria-hidden="true" />
        ) : (
          <ClaudeConversationView conversation={resolved} />
        );
      case 'gemini':
        // Same contract, Gemini's theme (Unit 10).
        return resolved === undefined ? (
          <div className={styles.loading} aria-hidden="true" />
        ) : (
          <GeminiConversationView conversation={resolved} />
        );
      case 'chatgpt':
        // Same contract, ChatGPT's theme (Unit 11b).
        return resolved === undefined ? (
          <div className={styles.loading} aria-hidden="true" />
        ) : (
          <ChatGPTConversationView conversation={resolved} />
        );
    }
  }
}

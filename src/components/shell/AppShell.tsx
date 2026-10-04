import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibrary } from '@/features/library/useLibrary';
import { useConversationSearch } from '@/features/search/useConversationSearch';
import { translateMessage } from '@/i18n/messages';
import { Sidebar } from '@/components/library/Sidebar';
import { LibraryEmptyState } from '@/components/library/LibraryEmptyState';
import { StorageQuotaWarning } from '@/components/library/StorageQuotaWarning';
import { DeleteConversationDialog } from '@/components/library/DeleteConversationDialog';
import { ClearLibraryDialog } from '@/components/library/ClearLibraryDialog';
import { ConversationStage } from '@/components/shell/ConversationStage';
import { MetadataPanel } from '@/components/library/MetadataPanel';
import { useActiveConversationMetadata } from '@/features/library/useActiveConversationMetadata';
import { ImportPage } from '@/components/import/ImportPage';
import styles from './AppShell.module.css';

/**
 * Application shell: sidebar + main region (`ui-context.md` §3, §5).
 *
 * Composition only — all state lives in `useLibrary`, so this file stays
 * presentational like `ImportPage` (`code-standards.md` → component/feature
 * separation).
 *
 * The main region is chosen by state, never by a route: that is what makes
 * switching conversations a re-render rather than a page load (FR5). In priority
 * order it shows
 *   - the import screen whenever the user asked for it (`isImporting`),
 *   - the Empty State when the library has no records,
 *   - the active conversation's themed renderer (`ConversationStage`, Unit 06)
 *     when one is selected, and
 *   - the Empty State again only as a defensive degradation (ADR #12): through
 *     app flows a selection always exists when records do — import activates
 *     its batch and initial load activates the newest entry — so reaching the
 *     final branch means the active record vanished out-of-band.
 *
 * `isImporting` is checked *first* and is deliberately its own flag rather than
 * "nothing is selected": the import action has to work while a conversation is
 * open, which an inferred condition cannot express.
 */
export function AppShell(): JSX.Element {
  const { t } = useTranslation();
  const {
    entries,
    activeId,
    isImporting,
    importPlatform,
    isLoading,
    errorMessage,
    isStorageNearLimit,
    pendingDelete,
    importSummary,
    isClearAllPending,
    selectConversation,
    openImport,
    closeImport,
    requestDelete,
    confirmDelete,
    cancelDelete,
    addConversations,
    dismissImportSummary,
    requestClearAll,
    confirmClearAll,
    cancelClearAll,
    dismissError,
  } = useLibrary();

  const activeEntry = entries.find((entry) => entry.id === activeId);

  // Unit 05: conversation-level metadata for the panel. Called unconditionally
  // (hooks rule); with no selection it resolves nothing and costs one no-op state.
  const { fields: metadataFields } = useActiveConversationMetadata(activeId);

  // Unit 07: search index + term, kept at shell level like every other library
  // slice so the Sidebar stays free of storage access (FR3).
  const search = useConversationSearch();

  return (
    <div className={styles.shell}>
      <Sidebar
        entries={entries}
        activeId={activeId}
        isLoading={isLoading}
        search={search}
        onSelect={selectConversation}
        onRequestDelete={requestDelete}
        onRequestClearAll={requestClearAll}
        onImportClick={openImport}
      />

      <div className={styles.main}>
        <StorageQuotaWarning isNearLimit={isStorageNearLimit} />

        {errorMessage !== undefined && (
          <p className={styles.error} role="alert">
            {/* Translated at render time, so a language switch re-renders the
                banner instead of leaving stale copy on screen (Unit 12). */}
            {translateMessage(t, errorMessage)}
            <button type="button" className={styles.dismiss} onClick={dismissError}>
              {t('shell.dismiss')}
            </button>
          </p>
        )}

        {/* ADR #13's one-per-batch summary. A status region (not an alert) because
            a skipped duplicate is news, not a failure; non-blocking by design, so
            a large batch costs exactly zero clicks. */}
        {importSummary !== undefined && (
          <p className={styles.summary} role="status">
            {translateMessage(t, importSummary)}
            <button type="button" className={styles.dismiss} onClick={dismissImportSummary}>
              {t('shell.dismiss')}
            </button>
          </p>
        )}

        <div className={styles.content}>
          {/* `isLoading` is checked first so a brief read never flashes the Empty
              State, which would falsely suggest the library was lost. */}
          {isLoading ? null : isImporting ? (
            <ImportPage
              onImported={addConversations}
              // Unit 13 (FR6): set only when the screen was asked for from a
              // platform group, so only then does Step 1 get skipped.
              initialPlatform={importPlatform}
              // Only offered when there is something to go back to.
              {...(entries.length > 0 ? { onCancel: closeImport } : {})}
            />
          ) : entries.length === 0 ? (
            // Genuine emptiness — including right after "حذف همه‌ی گفتگوها"
            // confirms (ADR #14). Not a fallback for "nothing selected".
            <LibraryEmptyState onImportClick={openImport} />
          ) : activeEntry !== undefined ? (
            // Unit 05: the metadata panel sits above the conversation region
            // (`ui-context.md` §3 — «Panel کناری یا بخش بالای ناحیه‌ی مکالمه»).
            // Unit 06: the stage below dispatches to the platform's theme
            // (`ConversationStage` replaced Unit 04's placeholder seam).
            <div className={styles.activeRegion}>
              <MetadataPanel
                fields={metadataFields}
                messageCount={activeEntry.messageCount}
                platform={activeEntry.platform}
              />
              <ConversationStage entry={activeEntry} />
            </div>
          ) : (
            // Defensive only (ADR #12): unreachable through app flows, because
            // import and initial load both activate a conversation. Kept so an
            // out-of-band deletion (direct DB manipulation) degrades to the
            // Empty State instead of a blank pane.
            <LibraryEmptyState onImportClick={openImport} />
          )}
        </div>
      </div>

      {/* All dialogs render at shell level so they overlay the whole app and are
          not clipped by the sidebar's scroll container. Duplicates need none since
          ADR #13 — they are skipped silently and reported in the summary above. */}
      <DeleteConversationDialog
        pendingDelete={pendingDelete}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
      <ClearLibraryDialog
        isPending={isClearAllPending}
        onConfirm={confirmClearAll}
        onCancel={cancelClearAll}
      />
    </div>
  );
}

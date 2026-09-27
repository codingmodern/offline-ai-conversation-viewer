import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedConversation } from '@/types/conversation';
import { countDuplicates } from '@/storage/conversationStore';
import type { DuplicateCounts } from '@/storage/conversationStore';
import { useImport } from '@/features/import/useImport';
import { ImportDropzone } from '@/components/import/ImportDropzone';
import { ImportFileList } from '@/components/import/ImportFileList';
import { LargeFileWarning } from '@/components/import/LargeFileWarning';
import { PlatformPicker } from '@/components/import/PlatformPicker';
import { findPlatformOption } from '@/components/import/platformOptions';
import type { PlatformOptionId } from '@/components/import/platformOptions';
import styles from './GuidedImportFlow.module.css';

interface GuidedImportFlowProps {
  /**
   * Called ONCE with the whole batch when the user confirms Step 3 (FR11).
   * Optional so the flow still works standalone, without a library to save into.
   */
  readonly onConfirm?: ((conversations: readonly UnifiedConversation[]) => void) | undefined;
}

/** Translation keys for the three steps, in order (Unit 12). */
const STEP_KEYS = ['import.stepPlatform', 'import.stepFile', 'import.stepConfirm'] as const;

/**
 * The three-step guided import (`08-guided-import-flow.md`): pick a platform,
 * choose the export file, confirm. Step 2 embeds the Unit 01 pipeline **unchanged**
 * — detection (Unit 02) stays automatic inside it, and the chosen platform is
 * only *compared* against what the files turn out to be (FR7/FR8), never used to
 * steer the parser.
 */
export function GuidedImportFlow({ onConfirm }: GuidedImportFlowProps = {}): JSX.Element {
  const { t } = useTranslation();
  const { items, pendingLargeFiles, importedFiles, isBusy, addFiles, confirmLargeFile, cancelLargeFile, reset } =
    useImport();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [platform, setPlatform] = useState<PlatformOptionId | undefined>(undefined);
  const [preview, setPreview] = useState<DuplicateCounts | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);

  const conversations = useMemo(
    () => importedFiles.flatMap((file) => file.conversations),
    [importedFiles],
  );

  // FR7: detection is the authority; the picker choice is only verified against it.
  const mismatchFile = useMemo(
    () =>
      platform === undefined
        ? undefined
        : importedFiles.find((file) => file.providerId !== platform),
    [importedFiles, platform],
  );

  // Step 3 preview (FR10): read-only duplicate count against the stored library,
  // using the same rule the save transaction will apply. Fails open on a read
  // error — the in-memory totals are shown and dedup still happens at save time.
  useEffect(() => {
    if (step !== 3) {
      return;
    }
    let cancelled = false;
    setPreview(undefined);
    void countDuplicates(conversations).then((result) => {
      if (cancelled) {
        return;
      }
      setPreview(result.ok ? result.data : { newCount: conversations.length, duplicateCount: 0 });
    });
    return (): void => {
      cancelled = true;
    };
  }, [step, conversations]);

  const handlePlatformSelect = (id: PlatformOptionId): void => {
    // A *different* platform invalidates already-parsed files (their providerId
    // can no longer match). Re-picking the current one keeps the batch intact,
    // so backing out of Step 2 to glance at Step 1 never destroys work (FR9).
    if (id !== platform && importedFiles.length > 0) {
      reset();
    }
    setPlatform(id);
  };

  const canContinueFromFiles =
    platform !== undefined &&
    importedFiles.length > 0 &&
    !isBusy &&
    mismatchFile === undefined &&
    conversations.length > 0;

  const handleConfirm = (): void => {
    if (conversations.length === 0) {
      return;
    }
    setIsDone(true);
    onConfirm?.(conversations);
  };

  if (isDone) {
    return (
      <div className={styles.done} role="status">
        <p>{t('import.doneTitle')}</p>
        {onConfirm === undefined && (
          <p className={styles.doneNote}>{t('import.doneNote')}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <ol className={styles.steps}>
        {STEP_KEYS.map((stepKey, index) => {
          const position = (index + 1) as 1 | 2 | 3;
          const stateClass =
            position < step
              ? styles.stepDone
              : position === step
                ? styles.stepCurrent
                : styles.stepTodo;
          return (
            <li key={stepKey} className={stateClass} aria-current={position === step ? 'step' : undefined}>
              <span className={styles.stepMark} aria-hidden="true">
                {position < step ? '✓' : position}
              </span>
              {t(stepKey)}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section className={styles.body}>
          <PlatformPicker selected={platform} onSelect={handlePlatformSelect} />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={platform === undefined}
              onClick={() => setStep(2)}
            >
              {t('import.nextStep')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={styles.body}>
          <ImportDropzone onFilesSelected={addFiles} />
          <LargeFileWarning
            pendingFiles={pendingLargeFiles}
            onConfirm={confirmLargeFile}
            onCancel={cancelLargeFile}
          />
          <ImportFileList items={items} />
          {platform !== undefined && mismatchFile !== undefined && (
            <div className={styles.mismatch} role="alert">
              <p>
                {t('import.mismatch', {
                  actual:
                    findPlatformOption(mismatchFile.providerId)?.label ?? mismatchFile.providerId,
                  expected: findPlatformOption(platform)?.label ?? platform,
                })}
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={reset}>
                  {t('import.chooseAnotherFile')}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setStep(1)}>
                  {t('import.backToPlatform')}
                </button>
              </div>
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setStep(1)}>
              {t('import.previousStep')}
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!canContinueFromFiles}
              onClick={() => setStep(3)}
            >
              {t('import.nextStep')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className={styles.body}>
          <div className={styles.preview} aria-live="polite">
            {preview === undefined ? (
              <p>{t('import.checkingDuplicates')}</p>
            ) : (
              <>
                {preview.newCount > 0 && (
                  <p>{t('import.newCount', { count: preview.newCount })}</p>
                )}
                {preview.duplicateCount > 0 && (
                  <p>{t('import.duplicateCount', { count: preview.duplicateCount })}</p>
                )}
                {preview.newCount === 0 && preview.duplicateCount > 0 && (
                  <p className={styles.allDuplicates}>
                    {t('import.allDuplicates')}
                  </p>
                )}
                <ul className={styles.fileNames}>
                  {importedFiles.map((file, index) => (
                    <li key={`${file.fileName}-${index}`}>{file.fileName}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setStep(2)}>
              {t('import.previousStep')}
            </button>
            <button type="button" className={styles.primary} onClick={handleConfirm}>
              {t('import.confirmImport')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

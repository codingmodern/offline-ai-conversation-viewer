import { useState } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { PLATFORM_OPTIONS } from './platformOptions';
import type { PlatformOptionId } from './platformOptions';
import { PlatformIcon } from './PlatformIcons';
import styles from './PlatformPicker.module.css';

interface PlatformPickerProps {
  readonly selected: PlatformOptionId | undefined;
  readonly onSelect: (id: PlatformOptionId) => void;
}

/**
 * Step 1 of the guided import flow (spec FR2–FR4): the four offered platforms
 * as toggle cards. Unavailable platforms answer with an inline notice instead
 * of being hidden, so the roadmap stays visible (spec §2). The Continue button
 * lives in `GuidedImportFlow` — this component only owns the choice.
 *
 * Unit 12: the notice is held as a translation **key**, because it is a message
 * that can stay on screen across a language switch — storing the finished sentence
 * would leave it frozen in the language that was active when it appeared.
 */
export function PlatformPicker({ selected, onSelect }: PlatformPickerProps): JSX.Element {
  const { t } = useTranslation();
  const [noticeKey, setNoticeKey] = useState<string | undefined>(undefined);

  const handleClick = (id: PlatformOptionId, available: boolean): void => {
    if (!available) {
      setNoticeKey('import.comingSoonNotice');
      return;
    }
    setNoticeKey(undefined);
    onSelect(id);
  };

  return (
    <section aria-label={t('import.platformPickerLabel')}>
      <div className={styles.grid} role="group" aria-label={t('import.platformGroupLabel')}>
        {PLATFORM_OPTIONS.map((option) => {
          const isSelected = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              className={isSelected ? styles.cardSelected : styles.card}
              aria-pressed={isSelected}
              onClick={() => handleClick(option.id, option.available)}
            >
              <span className={styles.iconChip}>
                <PlatformIcon id={option.id} />
              </span>
              <span className={styles.label}>{option.label}</span>
              {!option.available && <span className={styles.badge}>{t('import.comingSoon')}</span>}
            </button>
          );
        })}
      </div>
      {noticeKey !== undefined && (
        <p className={styles.notice} role="status">
          {t(noticeKey)}
        </p>
      )}
    </section>
  );
}

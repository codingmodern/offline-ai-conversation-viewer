import { useState } from 'react';
import type { JSX } from 'react';
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
 */
export function PlatformPicker({ selected, onSelect }: PlatformPickerProps): JSX.Element {
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const handleClick = (id: PlatformOptionId, available: boolean): void => {
    if (!available) {
      setNotice('واردات از این پلتفرم به‌زودی اضافه می‌شود.');
      return;
    }
    setNotice(undefined);
    onSelect(id);
  };

  return (
    <section aria-label="انتخاب پلتفرم">
      <div className={styles.grid} role="group" aria-label="پلتفرم گفتگوها">
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
              {!option.available && <span className={styles.badge}>به‌زودی</span>}
            </button>
          );
        })}
      </div>
      {notice !== undefined && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

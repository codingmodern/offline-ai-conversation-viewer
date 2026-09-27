import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  setLanguage,
  type LanguageCode,
} from '@/i18n';
import styles from './LanguageToggle.module.css';

interface LanguageToggleProps {
  /**
   * Notified after the switch is persisted and applied. Optional because the
   * toggle's only job is changing the language; the onboarding screen uses it to
   * know the choice has been made and let the user into the app (spec user flow
   * step 3).
   */
  readonly onChange?: (code: LanguageCode) => void;
}

/**
 * The one language switcher in the app (spec FR4/UI Behavior → «Language
 * Switcher در تنظیمات هم از همون کامپوننت toggle استفاده کنه»).
 *
 * Rendered by both the first-run onboarding screen and the sidebar, so there is
 * exactly one implementation of "change the language" — the same reasoning the
 * project already applies to `ConfirmDialog`. It owns the switch itself
 * (`setLanguage` persists + applies without a reload) rather than reporting
 * upward, so neither host has to re-implement the persistence rule.
 *
 * The active language is read from the live i18next instance instead of a prop,
 * which is what makes the highlight correct after a switch without any state of
 * its own.
 *
 * Accessibility: a labelled `role="group"` of two `aria-pressed` buttons, so the
 * current choice is announced rather than merely coloured. Each option carries
 * its own `lang`, so a screen reader pronounces «فارسی» in Persian even while
 * the surrounding UI is English.
 */
export function LanguageToggle({ onChange }: LanguageToggleProps = {}): JSX.Element {
  const { t, i18n } = useTranslation();
  const current: LanguageCode = isSupportedLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;

  return (
    <div className={styles.toggle} role="group" aria-label={t('language.toggleLabel')}>
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = language.code === current;
        return (
          <button
            key={language.code}
            type="button"
            className={isActive ? styles.optionActive : styles.option}
            // Announced as a pressed state so the selection is never colour-only
            // (`ui-context.md` §6).
            aria-pressed={isActive}
            lang={language.code}
            dir={language.dir}
            onClick={(): void => {
              if (isActive) {
                // Re-picking the current language is a no-op: persisting it again
                // is harmless, but firing `onChange` would wrongly tell the
                // onboarding screen that a choice was just made.
                return;
              }
              setLanguage(language.code);
              onChange?.(language.code);
            }}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );
}
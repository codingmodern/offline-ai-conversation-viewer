import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import styles from './LanguageOnboarding.module.css';

interface LanguageOnboardingProps {
  /**
   * Called once a language has actually been chosen, so the host can let the
   * user into the app (spec user flow step 3: choosing is what advances).
   */
  readonly onComplete: () => void;
}

/**
 * First-run language chooser (spec FR3).
 *
 * Shown **only** while no valid choice exists in `localStorage`. That condition
 * is evaluated by the host from the stored value, which is what makes the two
 * required behaviours fall out of one rule (spec User Flow 4 + Edge Cases):
 * a returning user never sees this screen again, and a user who closes the app
 * *before* choosing sees it again next time — nothing is written unless a
 * language is chosen, so an abandoned onboarding leaves no record behind.
 *
 * There is deliberately no "skip"/"continue" affordance: the choice **is** the
 * way in. A second control that enters the app without a choice would leave the
 * language undefined and force an arbitrary decision later.
 *
 * The copy is translated like the rest of the UI, so the screen is readable in
 * whichever language the app booted with (the default before any choice).
 */
export function LanguageOnboarding({ onComplete }: LanguageOnboardingProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={styles.screen}>
      <section className={styles.card} aria-labelledby="language-onboarding-title">
        <h1 className={styles.title} id="language-onboarding-title">
          {t('language.onboardingTitle')}
        </h1>
        <p className={styles.description}>{t('language.onboardingDescription')}</p>
        {/* The very same toggle the sidebar uses (spec UI Behavior). */}
        <LanguageToggle onChange={onComplete} />
      </section>
    </div>
  );
}
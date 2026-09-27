import { useState } from 'react';
import type { JSX } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { LanguageOnboarding } from '@/components/i18n/LanguageOnboarding';
import { readStoredLanguage } from '@/i18n';

/**
 * Application root.
 *
 * Unit 04 replaced the bare import screen with the shell (sidebar + main region);
 * conversation rendering inside that region arrived with Unit 06.
 *
 * Unit 12 adds the one gate in front of it: the first-run language chooser.
 *
 * The gate is decided by **the stored value, read once as initial state**, not by
 * a flag in memory: that is precisely what the spec's two symmetry requirements
 * need (User Flow 4, Edge Cases) — a returning user goes straight to the shell
 * because `app-language` is present, and an abandoned onboarding reappears because
 * nothing was ever written. Reading it in the initializer (rather than in an
 * effect) also means a returning user never sees the onboarding screen for a
 * frame.
 */
export function App(): JSX.Element {
  const [hasChosenLanguage, setHasChosenLanguage] = useState(
    (): boolean => readStoredLanguage() !== null,
  );

  if (!hasChosenLanguage) {
    return (
      <LanguageOnboarding
        onComplete={(): void => {
          setHasChosenLanguage(true);
        }}
      />
    );
  }

  return <AppShell />;
}

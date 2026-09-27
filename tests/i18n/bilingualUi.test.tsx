import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import i18n, {
  LANGUAGE_STORAGE_KEY,
  directionFor,
  readStoredLanguage,
  setLanguage,
  translateMessage,
  userMessage,
} from '@/i18n';

describe('Unit 12: Bilingual UI Support', () => {
  beforeEach(() => {
    window.localStorage.clear();
    void i18n.changeLanguage('en');
  });

  describe('Language onboarding & persistence', () => {
    it('shows the onboarding screen when no language preference is stored', () => {
      render(<App />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'فارسی' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    });

    it('choosing a language saves preference to localStorage and opens the shell', async () => {
      const user = userEvent.setup();
      render(<App />);

      const faButton = screen.getByRole('button', { name: 'فارسی' });
      await user.click(faButton);

      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fa');
      expect(readStoredLanguage()).toBe('fa');
      expect(document.documentElement.lang).toBe('fa');
      expect(document.documentElement.dir).toBe('rtl');
    });

    it('skips onboarding and boots directly to shell when preference is already stored', () => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fa');
      setLanguage('fa');

      render(<App />);

      // Onboarding card is not rendered; sidebar navigation is present
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('Direction and document mirroring', () => {
    it('maps language codes to appropriate text directions', () => {
      expect(directionFor('fa')).toBe('rtl');
      expect(directionFor('en')).toBe('ltr');
    });

    it('updates document.documentElement lang and dir on language change', () => {
      setLanguage('fa');
      expect(document.documentElement.lang).toBe('fa');
      expect(document.documentElement.dir).toBe('rtl');

      setLanguage('en');
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
    });
  });

  describe('Deferred translatable messages', () => {
    it('translates UserMessage descriptors dynamically according to active language', () => {
      const msg = userMessage('errors.EmptyContentError');

      setLanguage('en');
      expect(translateMessage(msg)).toBe(i18n.t('errors.EmptyContentError', { lng: 'en' }));

      setLanguage('fa');
      expect(translateMessage(msg)).toBe(i18n.t('errors.EmptyContentError', { lng: 'fa' }));
    });
  });
});


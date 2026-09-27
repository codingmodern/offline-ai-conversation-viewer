import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/common.json';
import fa from '@/locales/fa/common.json';

/**
 * Bilingual UI foundation (Unit 12, `12-bilingual-ui.md`).
 *
 * Translation resources are **bundled imports**, never fetched: the app must stay
 * fully offline (spec NFR1 — no CDN), and a bundled `common` namespace keeps the
 * added weight to just two small JSON files (NFR3).
 *
 * One deliberate consequence of a bundled namespace: adding a language later is
 * a new `locales/{lng}/common.json` plus one entry in `SUPPORTED_LANGUAGES` —
 * no logic change anywhere (spec Goal).
 */

/** The single `localStorage` key holding the user's explicit choice (spec FR6). */
export const LANGUAGE_STORAGE_KEY = 'app-language';

/**
 * Languages the UI ships with, in toggle order (spec UI Behavior → «فارسی | English»).
 *
 * `label` is the language's **autonym** — the name it calls itself — and is
 * deliberately not a translation key: a language must always be offered in its
 * own script (a Persian speaker looking for their language looks for «فارسی»,
 * not for however the current language happens to spell it). This mirrors how
 * platform names are treated as data rather than copy (`platformLabels.ts`).
 *
 * `dir` is data, not styling: it is what the `<html>` element must carry for the
 * browser's own mirroring (scrollbars, form controls, logical CSS) to follow the
 * chosen language — the spec's «تنظیم خودکار dir» requirement.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'fa', label: 'فارسی', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

/** Text direction for a language code. Unknown codes fall back to `ltr`. */
export type TextDirection = 'rtl' | 'ltr';

/**
 * The language used *before* the user has chosen one.
 *
 * English on purpose, and deliberately **not** derived from
 * `navigator.language`: the spec states browser language must not influence the
 * decision (Edge Cases), so the pre-choice state has to be a fixed default. It
 * is also the language the Validation rule names as the fallback for a corrupt
 * stored value, which keeps the two "no valid choice exists" paths identical.
 */
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** Narrows arbitrary text (including a tampered `localStorage` value) to a language code. */
export function isSupportedLanguage(value: unknown): value is LanguageCode {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.some((entry) => entry.code === value);
}

/**
 * Reads the stored choice, returning `null` for **anything** that is not one of
 * the supported codes (spec Validation: corrupt/invalid → English + onboarding).
 *
 * Reading `localStorage` can itself throw — Safari's private mode, a
 * `SecurityError` for disabled storage, quota-exceeded on write — so the whole
 * access is guarded. A storage that cannot be read is exactly the "no valid
 * stored value" case, which must degrade rather than crash the app.
 */
export function readStoredLanguage(): LanguageCode | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the language the app boots with: the stored choice, else the default.
 *
 * Exported (and pure) so the fallback rule is testable without re-initializing
 * the i18next singleton.
 */
export function resolveInitialLanguage(): LanguageCode {
  return readStoredLanguage() ?? DEFAULT_LANGUAGE;
}

/** Text direction for a language code, read from the supported-language table. */
export function directionFor(code: LanguageCode): TextDirection {
  return SUPPORTED_LANGUAGES.find((entry) => entry.code === code)?.dir ?? 'ltr';
}

/**
 * The BCP-47 locale used for `Intl` date/number formatting.
 *
 * Kept separate from the language code because they are different facts:
 * `fa` says which copy to render, `fa-IR` additionally says to use the Persian
 * calendar and Persian digits. Without this split a switch to English would keep
 * rendering Jalali dates — the metadata panel and the sidebar's import date would
 * silently stay Persian, which is the exact "UI in two languages" failure AC4
 * rules out.
 */
export function dateLocaleFor(code: LanguageCode): string {
  return code === 'fa' ? 'fa-IR' : 'en-US';
}

/** Locale for the currently active language. */
export function activeDateLocale(): string {
  return dateLocaleFor(isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE);
}

/**
 * Mirrors the active language onto the document element.
 *
 * `lang` and `dir` are set together because they answer different questions:
 * `lang` drives hyphenation, spell-check and screen-reader pronunciation, `dir`
 * drives layout mirroring. Setting only `dir` would leave assistive technology
 * announcing Persian text as English.
 */
export function applyDocumentLanguage(code: LanguageCode): void {
  const root = document.documentElement;
  root.lang = code;
  root.dir = directionFor(code);
  // The tab title is UI copy too, so it follows the chosen language.
  document.title = i18n.t('app.title');
}

/**
 * Persists the explicit choice and applies it immediately — no reload (spec
 * NFR2, AC4). A write failure (disabled/quota-full storage) must not block the
 * switch: the UI changes for this session, and the next launch falls back to
 * onboarding, which is the honest outcome rather than a silent, half-applied
 * preference.
 */
export function setLanguage(code: LanguageCode): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
  void i18n.changeLanguage(code);
  applyDocumentLanguage(code);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    fa: { common: fa },
  },
  lng: resolveInitialLanguage(),
  // Unknown keys can only appear if a locale file drifts, and English is the
  // reference locale — the same fallback the Validation rule names.
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: ['common'],
  interpolation: {
    // React already escapes every interpolated value; escaping twice would show
    // `&amp;` instead of `&` in the Persian copy.
    escapeValue: false,
  },
  // Synchronous init: with bundled resources there is nothing to wait for, and
  // waiting would render one frame of untranslated keys (spec UI Behavior →
  // «بدون پرش/flicker بصری»).
  initAsync: false,
});

// Applies `lang`/`dir`/title on every change — including the switch performed by
// the toggle — so the document element can never drift from the active language.
i18n.on('languageChanged', (code: string) => {
  if (isSupportedLanguage(code)) {
    applyDocumentLanguage(code);
  }
});

applyDocumentLanguage(resolveInitialLanguage());

export * from './messages';
export default i18n;
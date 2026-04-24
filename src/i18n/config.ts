/**
 * i18n configuration for HMWP (Phase 3a).
 *
 * Defaults to English (per user direction). User preference is persisted
 * to localStorage under `hmwp.language`. RTL direction flip is handled by
 * LanguageProvider, not here.
 *
 * String source of truth:
 *   - src/i18n/en.json   English, canonical
 *   - src/i18n/ar.json   Arabic, translated inline as UI is built
 *
 * Missing key fallback is English. That means we can ship new features
 * without Arabic strings ready, and the UI doesn't break — it just renders
 * English in Arabic mode for those specific strings until translated.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en.json';
import ar from './ar.json';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

export function isRTL(lang: string | undefined | null): boolean {
  return !!lang && (RTL_LANGUAGES as string[]).includes(lang);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'hmwp.language',
      caches: ['localStorage'],
    },
    interpolation: {
      // React already escapes values — disable to keep Arabic / quoted content clean
      escapeValue: false,
    },
    returnNull: false,
  });

export default i18n;

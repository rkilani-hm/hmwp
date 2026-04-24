/**
 * LanguageContext — tracks the current UI language and flips the document
 * direction between LTR and RTL so Tailwind logical properties and the
 * [dir="rtl"] rules in index.css behave correctly without per-component work.
 *
 * Auto-applied on mount. Any component can call useLanguage() to read or
 * change the current language; LanguageToggle is a convenient consumer.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isRTL, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/config';

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  direction: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const initial = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : 'en';
  const [language, setLanguageState] = useState<SupportedLanguage>(initial);

  useEffect(() => {
    // Sync state if i18n language changes from another source (e.g. browser detection).
    const onChange = (lng: string) => {
      if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lng)) {
        setLanguageState(lng as SupportedLanguage);
      }
    };
    i18n.on('languageChanged', onChange);
    return () => {
      i18n.off('languageChanged', onChange);
    };
  }, [i18n]);

  useEffect(() => {
    // Apply direction + lang attribute to <html> so the whole document flips.
    const dir: 'ltr' | 'rtl' = isRTL(language) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  const setLanguage = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, direction: isRTL(language) ? 'rtl' : 'ltr' }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

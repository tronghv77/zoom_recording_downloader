import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, TranslationKey, translations } from './translations';
import { api } from '../api/client';

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'vi',
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('vi');

  useEffect(() => {
    // Load saved language from settings
    api.settings.getAll().then((s: any) => {
      if (s?.language && (s.language === 'vi' || s.language === 'en')) {
        setLangState(s.language);
      }
    }).catch(() => {});
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    // Persist to settings
    api.settings.getAll().then((s: any) => {
      api.settings.save({ ...s, language: newLang }).catch(() => {});
    }).catch(() => {});
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry['en'] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}

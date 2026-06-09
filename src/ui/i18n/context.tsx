import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, TranslationKey, translations } from './translations';
import { api } from '../api/client';

type TParams = Record<string, string | number>;

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: TParams) => string;
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

  const t = useCallback((key: TranslationKey, params?: TParams): string => {
    const entry = translations[key];
    let text: string = entry ? (entry[lang] || entry['en'] || key) : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
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

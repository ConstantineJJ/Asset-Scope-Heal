import React, { createContext, useContext, useMemo, useState } from 'react';
import { en } from './locales/en';
import { ru } from './locales/ru';

export type AppLanguage = 'en' | 'ru';

type Dictionary = typeof en;
type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const STORAGE_KEY = 'asset-doctor.language';

function readStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'ru' ? 'ru' : 'en';
}

function getByPath(dictionary: Dictionary, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[part];
  }, dictionary);
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined ? _match : String(value);
  });
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const value = useMemo<I18nContextValue>(() => {
    const active = language === 'ru' ? ru : en;

    return {
      language,
      setLanguage,
      t: (key, params) => {
        // English is the source of truth. Missing Russian keys fall back to English.
        const translated = getByPath(active as Dictionary, key);
        const fallback = getByPath(en, key);
        const template =
          typeof translated === 'string'
            ? translated
            : typeof fallback === 'string'
              ? fallback
              : key;
        return interpolate(template, params);
      },
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}

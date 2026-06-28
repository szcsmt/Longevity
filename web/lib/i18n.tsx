'use client';

import {
  createContext, useContext, useEffect, useMemo, useState,
  type ReactNode, type CSSProperties,
} from 'react';
import { messages, LOCALES, type Locale } from './dictionaries';

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LangContext = createContext<Ctx>({ locale: 'en', setLocale: () => {}, t: (k) => k });

const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  // Pick up a saved choice, otherwise the browser language (only if we support it).
  useEffect(() => {
    let initial: Locale | null = null;
    try {
      const saved = localStorage.getItem('lr-locale');
      if (saved && isLocale(saved)) initial = saved;
    } catch { /* ignore */ }
    if (!initial && typeof navigator !== 'undefined') {
      const n = navigator.language.slice(0, 2).toLowerCase();
      if (isLocale(n)) initial = n;
    }
    if (initial && initial !== 'en') setLocaleState(initial);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem('lr-locale', l); } catch { /* ignore */ }
  };

  const t = useMemo(() => {
    return (key: string) => messages[key]?.[locale] ?? messages[key]?.en ?? key;
  }, [locale]);

  return <LangContext.Provider value={{ locale, setLocale, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;

/* Render a string with *gold accents*: the segments between asterisks get the
   gold treatment, everything else stays as is. Lets each language mark its own
   keywords for emphasis. */
export function richText(str: string, accentStyle?: CSSProperties): ReactNode[] {
  return str.split('*').map((seg, i) =>
    i % 2 === 1
      ? <em key={i} className="gold-text" style={{ fontStyle: 'normal', ...accentStyle }}>{seg}</em>
      : <span key={i}>{seg}</span>,
  );
}

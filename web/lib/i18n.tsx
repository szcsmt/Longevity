'use client';

import {
  createContext, useContext, useEffect, useMemo, useState,
  type ReactNode, type CSSProperties, useSyncExternalStore } from 'react';
import { messages, LOCALES, type Locale } from './dictionaries';

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LangContext = createContext<Ctx>({ locale: 'en', setLocale: () => {}, t: (k) => k });

const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

const LOCALE_EVENT = 'lr-locale-change';

function applyLocale(l: Locale): void {
  document.documentElement.dataset.locale = l;
  document.documentElement.lang = l;
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

const subscribeLocale = (onChange: () => void) => {
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => window.removeEventListener(LOCALE_EVENT, onChange);
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  /* ── Which language the page is in ──

     The chosen locale lives on the document element, not in React state, and
     is read back with useSyncExternalStore. Loading it into state inside an
     effect meant the page rendered in English first and corrected itself a
     frame later — a German visitor watched the whole site flash English on
     every load, which is the kind of thing that reads as a broken site rather
     than as a slow one.

     The server can only honestly answer "en": it has no browser to ask. */
  const locale = useSyncExternalStore(
    subscribeLocale,
    () => (document.documentElement.dataset.locale as Locale) || 'en',
    () => 'en' as Locale,
  );

  useEffect(() => {
    let initial: Locale | null = null;
    try {
      const saved = localStorage.getItem('lr-locale');
      if (saved && isLocale(saved)) initial = saved;
    } catch { /* Private window, or site data blocked. English is the default. */ }
    if (!initial && typeof navigator !== 'undefined') {
      const n = navigator.language.slice(0, 2).toLowerCase();
      if (isLocale(n)) initial = n;
    }
    applyLocale(initial || 'en');
  }, []);

  const setLocale = (l: Locale) => {
    applyLocale(l);
    try { localStorage.setItem('lr-locale', l); } catch { /* the choice just does not persist */ }
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

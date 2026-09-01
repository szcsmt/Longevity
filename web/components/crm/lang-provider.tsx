'use client';

import { createContext, useContext } from 'react';
import { translate, type Lang } from '@/lib/crm/lang';

/* The language the server already decided, handed to the client half of the
   CRM. It is not read from the browser here: the server read the cookie and
   rendered accordingly, and a client component that went and asked again could
   disagree with the HTML it is hydrating. One decision, taken once, passed
   down. */
const Ctx = createContext<Lang>('hu');

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

/** `t('Mai teendők')` — the Hungarian sentence is the key. */
export function useT(): (hu: string) => string {
  const lang = useContext(Ctx);
  return (hu: string) => translate(lang, hu);
}

export function useLang(): Lang {
  return useContext(Ctx);
}

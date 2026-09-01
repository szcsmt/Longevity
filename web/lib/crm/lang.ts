import { EN } from './ui-text';

/* ══════════════════ One language, everywhere ══════════════════

   The home screen had an HU/EN toggle that changed the greeting and four
   links, and nothing else. Everything behind it was Hungarian. A switch that
   changes one screen is worse than no switch: it promises something the rest
   of the CRM does not honour, and somebody who picks English then works all
   day in a language they did not choose.

   ── The Hungarian text IS the key ──

   The usual shape for this is `t('admin.today.title')` with a catalogue of
   invented keys. Not here, for two reasons. Inventing five hundred key names
   is five hundred chances to name one badly, and a screen full of
   `t('lead.fold.qualification.hint')` is unreadable to whoever maintains it —
   you cannot tell what the page says without opening a second file.

   Instead the Hungarian sentence is the key and the map holds its English.
   The source stays readable, and a MISSING translation falls back to
   Hungarian: a sentence in the wrong language, which somebody notices and
   reports, rather than a raw `admin.today.title` on screen, which reads as a
   broken program.

   ── Why a cookie ──

   localStorage is invisible to the server, and most of this CRM renders on the
   server. A cookie is the one place both halves can read, so a page arrives in
   the right language rather than arriving in Hungarian and correcting itself
   after hydration.

   This file stays free of `next/headers` on purpose: client components import
   `translate` from here, and one server-only import would drag the whole
   request API into the browser bundle. Reading the cookie lives next door, in
   lang-server.ts. */

export type Lang = 'hu' | 'en';

export const LANG_COOKIE = 'lr_crm_lang';

export const isLang = (v: unknown): v is Lang => v === 'hu' || v === 'en';

/** Translate one Hungarian string. Unknown strings come back unchanged. */
export function translate(lang: Lang, hu: string): string {
  if (lang !== 'en') return hu;
  return EN[hu] ?? hu;
}

/** A `t` bound to one language, for a component that needs several strings. */
export function translator(lang: Lang): (hu: string) => string {
  return (hu: string) => translate(lang, hu);
}

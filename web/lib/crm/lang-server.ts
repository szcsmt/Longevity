import { cookies } from 'next/headers';
import { LANG_COOKIE, isLang, translator, type Lang } from './lang';

/* Reading the chosen language, which only a server component can do. Kept
   apart from lang.ts so that the pure half — the dictionary lookup — can be
   imported by client components without dragging `next/headers` into the
   browser bundle. */

/** The language for this request. Hungarian unless somebody chose otherwise. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'hu';
}

/** The language and a `t` bound to it — what most server components want. */
export async function lang(): Promise<{ lang: Lang; t: (hu: string) => string }> {
  const l = await getLang();
  return { lang: l, t: translator(l) };
}

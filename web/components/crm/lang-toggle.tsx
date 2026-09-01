'use client';

import { useRouter } from 'next/navigation';
import { LANG_COOKIE, type Lang } from '@/lib/crm/lang';
import { useLang } from './lang-provider';

/* ── Choosing the language ──

   Written to a cookie rather than to localStorage, because most of this CRM
   renders on the server and the server cannot see localStorage. With a cookie
   the next page arrives already in the chosen language instead of arriving in
   Hungarian and correcting itself a frame later.

   A full refresh rather than a client-side re-render: every server component
   on the screen has to be re-rendered with the new language, and asking Next
   to redo them is exactly what router.refresh() does. */
const OPTIONS: { id: Lang; label: string }[] = [
  { id: 'hu', label: 'HU' },
  { id: 'en', label: 'EN' },
];

/* Writing the cookie, out here rather than inside the component.

   `document.cookie = …` inside a component body is a write to something
   declared outside it, which the React compiler rules reject on sight — and
   they are right in general, even though an event handler is the one place it
   is safe. A named function says what it does and puts the write where nobody
   has to reason about render phases to know it is fine.

   A year, path-wide, and readable by the server on the very next request. Not
   httpOnly on purpose: this is a display preference rather than a credential,
   and the toggle has to be able to read it back. */
function rememberLang(next: Lang): void {
  document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function LangToggle({ className = 'crm-lang' }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();

  const choose = (next: Lang) => {
    if (next === lang) return;
    rememberLang(next);
    router.refresh();
  };

  return (
    <div className={className} role="group" aria-label={lang === 'en' ? 'Language' : 'Nyelv'}>
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === lang ? 'on' : ''}
          aria-pressed={o.id === lang}
          onClick={() => choose(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

'use client';

/* The CRM landing screen — a calm, interactive welcome. Centered logo, a
   greeting addressed to the signed-in user, an HU/EN language toggle, and a
   kinetic dot field that scatters away from the cursor. No clock, no rotating
   copy. Language choice persists in localStorage. */

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { KineticField } from './kinetic-field';

type Lang = 'hu' | 'en';

const T: Record<Lang, {
  hello: string; today: string; leads: string; analytics: string; masterplan: string;
  overdue: string; untouched: string; awaiting: string; stalled: string; noNext: string;
  search: string; searchPlaceholder: string;
}> = {
  hu: {
    hello: 'Isten hozta', today: 'Mai teendők', leads: 'Leadek', analytics: 'Analitika', masterplan: 'Masterplan',
    overdue: 'lejárt követés', untouched: 'érintetlen új lead', awaiting: 'válaszra vár',
    stalled: 'elakadt lead', noNext: 'következő lépés nélkül',
    search: 'Keresés', searchPlaceholder: 'Vevő, ügynökség vagy lakás…',
  },
  en: {
    hello: 'Welcome', today: 'Today', leads: 'Leads', analytics: 'Analytics', masterplan: 'Masterplan',
    overdue: 'overdue follow-ups', untouched: 'untouched new leads', awaiting: 'awaiting reply',
    stalled: 'stalled leads', noNext: 'without a next step',
    search: 'Search', searchPlaceholder: 'A buyer, an agency or a unit…',
  },
};

export interface HeroAlerts {
  overdue: number; untouched: number; awaiting: number; stalled: number; noNext: number;
}

/* ── The remembered language ──

   Read from the DOM rather than copied into state on mount. Loading a stored
   preference with setState inside an effect renders the wrong answer first
   and corrects it a frame later, which is why the toggle used to flick from
   HU to EN in front of somebody who had chosen EN. The document element is
   the source of truth, useSyncExternalStore reads it, and the server's
   answer is the default — which is what the server can honestly know. */
const LANG_EVENT = 'lr-lang';

function applyLang(l: Lang): void {
  document.documentElement.dataset.crmLang = l;
  window.dispatchEvent(new Event(LANG_EVENT));
}

const subscribeLang = (onChange: () => void) => {
  window.addEventListener(LANG_EVENT, onChange);
  return () => window.removeEventListener(LANG_EVENT, onChange);
};

export function WelcomeHero({ user, alerts }: { user: string; alerts?: HeroAlerts }) {
  const lang = useSyncExternalStore(
    subscribeLang,
    () => (document.documentElement.dataset.crmLang === 'en' ? 'en' : 'hu'),
    () => 'hu' as Lang,
  ) as Lang;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lr_lang');
      if (saved === 'hu' || saved === 'en') applyLang(saved);
    } catch {
      /* Private window, or site data blocked. Hungarian is the right default. */
    }
  }, []);

  const choose = (l: Lang) => {
    applyLang(l);
    try { localStorage.setItem('lr_lang', l); } catch { /* the choice just does not persist */ }
  };

  const t = T[lang];
  const name = user ? user.charAt(0).toUpperCase() + user.slice(1) : '';

  return (
    <div className="welcome">
      <KineticField />

      <div className="welcome-lang" role="group" aria-label="Nyelv">
        <button type="button" className={lang === 'hu' ? 'active' : ''} onClick={() => choose('hu')}>HU</button>
        <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => choose('en')}>EN</button>
      </div>

      <div className="welcome-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="welcome-logo" src="/LOGO.svg" alt="Longevity Resort" />
        <h1 className="welcome-greet">{t.hello}{name ? `, ${name}` : ''}</h1>
        {/* ── Search, where there is room to say what it searches ──

            It used to sit in the sidebar above the menu, which is the one
            place a search field is routinely mistaken for a filter on
            whatever is currently on screen. It is not: it looks through
            leads, agencies and their people, and the units on the masterplan,
            all at once. On the screen you land on, it can say so. */}
        <form action="/admin/search" method="get" className="welcome-search">
          <input
            className="crm-input" name="q" autoComplete="off"
            placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder}
          />
          <button type="submit" className="crm-btn gold">{t.search}</button>
        </form>

        <nav className="welcome-links">
          <Link href="/admin/today">{t.today}</Link>
          <span>·</span>
          <Link href="/admin/leads">{t.leads}</Link>
          <span>·</span>
          <Link href="/admin/analytics">{t.analytics}</Link>
          <span>·</span>
          <Link href="/admin/masterplan">{t.masterplan}</Link>
        </nav>

        {/* What needs doing — quiet when everything is handled. */}
        {alerts && (alerts.overdue + alerts.untouched + alerts.awaiting + alerts.stalled + alerts.noNext > 0) && (
          <div className="welcome-alerts">
            {alerts.overdue > 0 && <Link href="/admin/leads?flag=overdue">⚠ {alerts.overdue} {t.overdue}</Link>}
            {alerts.untouched > 0 && <Link href="/admin/leads?flag=uncontacted">{alerts.untouched} {t.untouched}</Link>}
            {alerts.stalled > 0 && <Link href="/admin/leads?flag=stalled">{alerts.stalled} {t.stalled}</Link>}
            {alerts.noNext > 0 && <Link href="/admin/leads?flag=nonext">{alerts.noNext} {t.noNext}</Link>}
            {alerts.awaiting > 0 && <Link href="/admin/leads?flag=silent">{alerts.awaiting} {t.awaiting}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

/* The CRM landing screen — a calm, interactive welcome. Centered logo, a
   greeting addressed to the signed-in user, an HU/EN language toggle, and a
   kinetic dot field that scatters away from the cursor. No clock, no rotating
   copy. Language choice persists in localStorage. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KineticField } from './kinetic-field';

type Lang = 'hu' | 'en';

const T: Record<Lang, {
  hello: string; today: string; leads: string; analytics: string; masterplan: string;
  overdue: string; untouched: string; awaiting: string; stalled: string; noNext: string;
}> = {
  hu: {
    hello: 'Isten hozta', today: 'Mai teendők', leads: 'Leadek', analytics: 'Analitika', masterplan: 'Masterplan',
    overdue: 'lejárt teendő', untouched: 'érintetlen új lead', awaiting: 'válaszra vár',
    stalled: 'elakadt lead', noNext: 'következő lépés nélkül',
  },
  en: {
    hello: 'Welcome', today: 'Today', leads: 'Leads', analytics: 'Analytics', masterplan: 'Masterplan',
    overdue: 'overdue tasks', untouched: 'untouched new leads', awaiting: 'awaiting reply',
    stalled: 'stalled leads', noNext: 'without a next step',
  },
};

export interface HeroAlerts {
  overdue: number; untouched: number; awaiting: number; stalled: number; noNext: number;
}

export function WelcomeHero({ user, alerts }: { user: string; alerts?: HeroAlerts }) {
  const [lang, setLang] = useState<Lang>('hu');

  useEffect(() => {
    const saved = localStorage.getItem('lr_lang');
    if (saved === 'hu' || saved === 'en') setLang(saved);
  }, []);

  const choose = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem('lr_lang', l); } catch { /* ignore */ }
  };

  const t = T[lang];
  const name = user ? user.charAt(0).toUpperCase() + user.slice(1) : '';

  return (
    <div className="welcome">
      <KineticField />

      <div className="welcome-lang" role="group" aria-label="Language">
        <button type="button" className={lang === 'hu' ? 'active' : ''} onClick={() => choose('hu')}>HU</button>
        <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => choose('en')}>EN</button>
      </div>

      <div className="welcome-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="welcome-logo" src="/LOGO.svg" alt="Longevity Resort" />
        <h1 className="welcome-greet">{t.hello}{name ? `, ${name}` : ''}</h1>
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
            {alerts.overdue > 0 && <Link href="/admin/today?owner=all">⚠ {alerts.overdue} {t.overdue}</Link>}
            {alerts.untouched > 0 && <Link href="/admin/today?owner=all">{alerts.untouched} {t.untouched}</Link>}
            {alerts.stalled > 0 && <Link href="/admin/today?owner=all">{alerts.stalled} {t.stalled}</Link>}
            {alerts.noNext > 0 && <Link href="/admin/today?owner=all">{alerts.noNext} {t.noNext}</Link>}
            {alerts.awaiting > 0 && <Link href="/admin/today?owner=all">{alerts.awaiting} {t.awaiting}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}

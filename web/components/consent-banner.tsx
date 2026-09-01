'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n';
import {
  ALL_DENIED, ALL_GRANTED, CONSENT_COOKIE, CONSENT_MAX_AGE, CONSENT_VERSION,
  googleSignals, readConsent, type Category, type Choices,
} from '@/lib/consent';

/* The consent banner. Replaces CookieYes.

   Order of operations matters and is the whole point: layout.tsx sets Consent
   Mode to denied *before* GTM loads, so nothing measures anyone until this
   component sends an update. Accept and reject are one click each, same size,
   same weight — a "reject" that is harder to find than "accept" is not valid
   consent under GDPR.

   Reopened from the footer via window.dispatchEvent(new Event('lr-consent-open')). */

export const OPEN_CONSENT_EVENT = 'lr-consent-open';

type Dict = Record<string, string>;

/* Kept in this file rather than the site dictionary: consent copy is legal
   text with its own review cycle, and it must stay together to be checkable. */
const T: Record<string, Dict> = {
  en: {
    title: 'Cookies on this site',
    body: 'We use cookies that are necessary for the site to work. With your permission we also measure how the site is used, so we can improve it. You can change your mind at any time.',
    accept: 'Accept all', reject: 'Reject non-essential', settings: 'Choose', save: 'Save choices', close: 'Close',
    necessary: 'Strictly necessary', necessaryNote: 'Needed for the site to function. Always on.',
    preferences: 'Preferences', preferencesNote: 'Remembers choices such as your language.',
    analytics: 'Statistics', analyticsNote: 'Counts visits and pages read, in aggregate, so we can improve the site.',
    marketing: 'Marketing', marketingNote: 'Would allow measuring advertising. We do not run advertising cookies today.',
    more: 'Cookie policy',
  },
  hu: {
    title: 'Sütik ezen az oldalon',
    body: 'A működéshez szükséges sütiket használjuk. A hozzájárulásoddal azt is mérjük, hogyan használják az oldalt, hogy fejleszthessük. A döntésed bármikor megváltoztathatod.',
    accept: 'Mindet elfogadom', reject: 'Csak a szükségeseket', settings: 'Beállítás', save: 'Mentés', close: 'Bezárás',
    necessary: 'Feltétlenül szükséges', necessaryNote: 'Az oldal működéséhez kell. Mindig aktív.',
    preferences: 'Beállítások', preferencesNote: 'Megjegyzi a választásaidat, például a nyelvet.',
    analytics: 'Statisztika', analyticsNote: 'Összesítve számolja a látogatásokat és az olvasott oldalakat, hogy fejleszthessük az oldalt.',
    marketing: 'Marketing', marketingNote: 'A hirdetések mérését tenné lehetővé. Jelenleg nem használunk hirdetési sütit.',
    more: 'Süti-tájékoztató',
  },
  de: {
    title: 'Cookies auf dieser Website',
    body: 'Wir verwenden Cookies, die für den Betrieb der Website erforderlich sind. Mit Ihrer Erlaubnis messen wir außerdem die Nutzung, um die Website zu verbessern. Sie können Ihre Entscheidung jederzeit ändern.',
    accept: 'Alle akzeptieren', reject: 'Nur notwendige', settings: 'Auswählen', save: 'Auswahl speichern', close: 'Schließen',
    necessary: 'Unbedingt erforderlich', necessaryNote: 'Für den Betrieb der Website nötig. Immer aktiv.',
    preferences: 'Präferenzen', preferencesNote: 'Merkt sich Einstellungen wie Ihre Sprache.',
    analytics: 'Statistik', analyticsNote: 'Zählt Besuche und gelesene Seiten in aggregierter Form, damit wir die Website verbessern können.',
    marketing: 'Marketing', marketingNote: 'Würde die Messung von Werbung erlauben. Derzeit setzen wir keine Werbe-Cookies ein.',
    more: 'Cookie-Richtlinie',
  },
  fr: {
    title: 'Cookies sur ce site',
    body: 'Nous utilisons des cookies nécessaires au fonctionnement du site. Avec votre accord, nous mesurons également son utilisation afin de l’améliorer. Vous pouvez changer d’avis à tout moment.',
    accept: 'Tout accepter', reject: 'Refuser le non-essentiel', settings: 'Choisir', save: 'Enregistrer', close: 'Fermer',
    necessary: 'Strictement nécessaires', necessaryNote: 'Nécessaires au fonctionnement du site. Toujours actifs.',
    preferences: 'Préférences', preferencesNote: 'Mémorise vos choix, par exemple la langue.',
    analytics: 'Statistiques', analyticsNote: 'Compte les visites et les pages lues, de façon agrégée, pour améliorer le site.',
    marketing: 'Marketing', marketingNote: 'Permettrait de mesurer la publicité. Nous n’utilisons pas de cookies publicitaires aujourd’hui.',
    more: 'Politique cookies',
  },
  ru: {
    title: 'Файлы cookie на этом сайте',
    body: 'Мы используем файлы cookie, необходимые для работы сайта. С вашего согласия мы также измеряем, как сайт используется, чтобы улучшать его. Вы можете изменить решение в любое время.',
    accept: 'Принять все', reject: 'Только необходимые', settings: 'Настроить', save: 'Сохранить', close: 'Закрыть',
    necessary: 'Строго необходимые', necessaryNote: 'Нужны для работы сайта. Всегда включены.',
    preferences: 'Предпочтения', preferencesNote: 'Запоминает ваш выбор, например язык.',
    analytics: 'Статистика', analyticsNote: 'Считает посещения и прочитанные страницы в совокупности, чтобы мы могли улучшать сайт.',
    marketing: 'Маркетинг', marketingNote: 'Позволил бы измерять рекламу. Сейчас мы не используем рекламные cookie.',
    more: 'Политика cookie',
  },
  zh: {
    title: '本网站使用 Cookie',
    body: '我们使用网站运行所必需的 Cookie。在您同意的情况下，我们还会统计网站的使用情况，以便改进。您可以随时更改您的选择。',
    accept: '全部接受', reject: '仅必要项', settings: '自行选择', save: '保存选择', close: '关闭',
    necessary: '严格必要', necessaryNote: '网站运行所必需。始终启用。',
    preferences: '偏好设置', preferencesNote: '记住您的选择，例如语言。',
    analytics: '统计', analyticsNote: '以汇总方式统计访问量和阅读的页面，以便我们改进网站。',
    marketing: '营销', marketingNote: '将用于衡量广告效果。我们目前不使用广告 Cookie。',
    more: 'Cookie 政策',
  },
};

const CATEGORIES: Category[] = ['necessary', 'preferences', 'analytics', 'marketing'];

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

/** Tell Google what is allowed, through the gtag shim site-tags.tsx installs
    before GTM loads. Also fires a dataLayer event so GTM triggers can react. */
function pushConsent(c: Choices) {
  try {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', googleSignals(c));
    } else {
      // Shim missing (script blocked?) — the arguments-object shape gtag uses.
      window.dataLayer.push(['consent', 'update', googleSignals(c)]);
    }
    window.dataLayer.push({ event: 'lr_consent_update', lr_consent: c });
  } catch { /* analytics must never break the page */ }
}

function writeCookie(c: Choices) {
  const record = { v: CONSENT_VERSION, at: new Date().toISOString(), c };
  const value = encodeURIComponent(JSON.stringify(record));
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  return record;
}

/** Log the decision server-side — the evidence half of "demonstrate consent". */
function logConsent(c: Choices) {
  try {
    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ choices: c, version: CONSENT_VERSION, locale: document.documentElement.lang }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function ConsentBanner() {
  const { locale } = useLang();
  const path = usePathname();
  const t = T[locale] || T.en;

  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [choices, setChoices] = useState<Choices>(ALL_DENIED);

  /* Decide whether to ask. Runs once, after hydration, so the server render is
     identical for everyone (and cacheable).

     The linter objects to setting state in an effect, and here it is wrong:
     the decision lives in a cookie, and reading it during render would make
     this page's HTML depend on the visitor — which is exactly what stops it
     being cached for everyone. One extra render on first load is the price of
     a cacheable page, and it is the right way round for a banner that is
     allowed to appear a beat late. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split('=')[1];
    const stored = readConsent(raw);
    if (stored) {
      setChoices(stored.c);
      pushConsent(stored.c);       // re-assert on every page load
    } else {
      setOpen(true);               // no valid decision → ask, nothing measured yet
    }
    const reopen = () => { setDetail(true); setOpen(true); };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const decide = (c: Choices) => {
    writeCookie(c);
    pushConsent(c);
    logConsent(c);
    setChoices(c);
    setOpen(false);
    setDetail(false);
  };

  // The CRM is a signed-in internal tool, not the public site: asking staff for
  // cookie consent on their own back office is noise, and it sat over the work.
  if (path?.startsWith('/admin')) return null;
  if (!open) return null;

  const toggle = (cat: Category) =>
    setChoices((c) => (cat === 'necessary' ? c : { ...c, [cat]: !c[cat] }));

  return (
    <div className="lr-consent" role="dialog" aria-modal="false" aria-label={t.title}>
      <div className="lr-consent-inner">
        <div className="lr-consent-title">{t.title}</div>
        <p className="lr-consent-body">{t.body}</p>

        {detail && (
          <div className="lr-consent-cats">
            {CATEGORIES.map((cat) => (
              <label key={cat} className="lr-consent-cat">
                <input
                  type="checkbox"
                  checked={cat === 'necessary' ? true : choices[cat]}
                  disabled={cat === 'necessary'}
                  onChange={() => toggle(cat)}
                />
                <span>
                  <b>{t[cat]}</b>
                  <em>{t[`${cat}Note`]}</em>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="lr-consent-actions">
          {/* Accept and reject are the same size and weight, side by side —
              an easier "accept" than "reject" invalidates the consent. */}
          <button type="button" className="lr-consent-btn primary" onClick={() => decide(ALL_GRANTED)}>
            {t.accept}
          </button>
          <button type="button" className="lr-consent-btn" onClick={() => decide(ALL_DENIED)}>
            {t.reject}
          </button>
          {detail ? (
            <button type="button" className="lr-consent-btn" onClick={() => decide(choices)}>
              {t.save}
            </button>
          ) : (
            <button type="button" className="lr-consent-link" onClick={() => setDetail(true)}>
              {t.settings}
            </button>
          )}
          <a className="lr-consent-link" href="/cookies">{t.more}</a>
        </div>
      </div>
    </div>
  );
}

/** The footer's "Cookie settings" trigger. */
export function openConsent() {
  try { window.dispatchEvent(new Event(OPEN_CONSENT_EVENT)); } catch { /* noop */ }
}

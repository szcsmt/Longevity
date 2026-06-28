'use client';

import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { LOCALES, LANG_NAMES, LANG_CODES, type Locale } from '@/lib/dictionaries';

const ffs = 'var(--font-raleway), sans-serif';

export function LanguageSelector() {
  const { locale, setLocale, t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', pointerEvents: 'auto' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('lang.label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'rgba(6,14,8,0.4)', border: '1px solid rgba(201,169,110,0.4)',
          borderRadius: 100, padding: '7px 12px', cursor: 'pointer',
          color: 'var(--gold)', backdropFilter: 'blur(6px)',
          transition: 'border-color 0.3s, background 0.3s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,169,110,0.75)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,169,110,0.4)'; }}
      >
        {/* Globe */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
        </svg>
        <span style={{ fontFamily: ffs, fontSize: 10, fontWeight: 400, letterSpacing: '0.12em' }}>{LANG_CODES[locale]}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s', opacity: 0.8 }}>
          <path d="M2 3.5L5 6.5l3-3" />
        </svg>
      </button>

      <div
        role="listbox"
        style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1100,
          minWidth: 150, padding: 6,
          background: 'rgba(8,18,11,0.96)', border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 12, backdropFilter: 'blur(12px)',
          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.85)',
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.28s cubic-bezier(0.16,1,0.3,1), transform 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {(LOCALES as readonly Locale[]).map((l) => {
          const on = l === locale;
          return (
            <button
              key={l}
              role="option"
              aria-selected={on}
              onClick={() => { setLocale(l); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: on ? 'rgba(201,169,110,0.12)' : 'transparent',
                border: 'none', borderRadius: 8, padding: '10px 12px',
                color: on ? 'var(--cream)' : 'var(--cr70)',
                fontFamily: ffs, fontSize: 13, fontWeight: 300,
                transition: 'background 0.25s, color 0.25s',
              }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(201,169,110,0.06)'; }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              {LANG_NAMES[l]}
              <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--gold)', opacity: on ? 1 : 0.5 }}>{LANG_CODES[l]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

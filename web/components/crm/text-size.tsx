'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useT } from './lang-provider';

/* ── How big the text is ──

   The CRM is read all day by people who did not choose its type size, and
   "make it bigger" is not one answer: comfortable for a salesperson in their
   sixties is oversized for somebody scanning a hundred leads on a laptop. So
   it is a setting, remembered per browser, and it scales the whole interface
   rather than one screen — a CRM where only the lead page grew would be a CRM
   with two type sizes.

   The chosen size lives on the document element rather than in React state,
   for two reasons. It has to reach the dialogs and the timeline strip, which
   render outside the shell; and reading a stored preference into state during
   an effect is the render-then-correct pattern that makes the buttons flicker
   through the wrong answer on every load. Here the DOM is the source of
   truth, useSyncExternalStore reads it, and the server's answer is the
   default — which is what the server can honestly know. */
const SIZES = [
  { id: 'sm', tz: '1', label: 'Kisebb betű' },
  { id: 'md', tz: '1.12', label: 'Nagyobb betű' },
  { id: 'lg', tz: '1.26', label: 'Legnagyobb betű' },
] as const;

const KEY = 'lr_text_size';
const EVENT = 'lr-text-size';

function apply(id: string): void {
  const size = SIZES.find((s) => s.id === id) || SIZES[0];
  document.documentElement.dataset.textSize = size.id;
  document.documentElement.style.setProperty('--tz', size.tz);
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

export function TextSize() {
  const t = useT();
  const id = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.textSize || 'sm',
    () => 'sm',
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && SIZES.some((s) => s.id === saved)) apply(saved);
    } catch {
      /* Private window, or site data blocked. The default size is correct. */
    }
  }, []);

  const choose = (next: string) => {
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* the size just does not persist */ }
  };

  return (
    <div className="crm-text-size" role="group" aria-label={t('Betűméret')}>
      {SIZES.map((s) => (
        <button
          key={s.id} type="button" title={t(s.label)} aria-label={t(s.label)}
          aria-pressed={id === s.id}
          className={id === s.id ? 'on' : ''}
          onClick={() => choose(s.id)}
        >A</button>
      ))}
    </div>
  );
}

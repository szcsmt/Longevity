'use client';

import { useEffect, useRef, useState } from 'react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* Answers are drafted safely: the terms the team confirmed (10% quarterly for 3
   years, 3-year buyback, managed rental, owner use) are stated directly; the rest
   defer to the legal/investment pack rather than inventing specifics. Replace the
   deferring ones with confirmed details before going fully live. */
const faqs = [
  { q: 'Can foreigners buy?', a: 'Yes. International buyers can own at Longevity Resort. The full legal pack sets out the exact ownership structure available for your situation.' },
  { q: 'What exactly do I own?', a: 'A private pool villa within the gated resort, together with the rights set out in your ownership agreement. The legal pack details the title and structure.' },
  { q: 'How does the 10% return work?', a: 'A 10% fixed annual return, paid quarterly for the first three years, generated through a fully managed rental operation.' },
  { q: 'How is the buyback guaranteed?', a: 'A 3-year buyback guarantee is included, giving you the option to sell your villa back under agreed terms, set out in the legal pack.' },
  { q: 'Who manages the villa?', a: 'A fully managed rental operation handles letting, guests, housekeeping and maintenance, so ownership stays hands-off.' },
  { q: 'Can I use my villa?', a: 'Yes. Owners have personal use each year, alongside the managed rental program.' },
  { q: 'What is included in the price?', a: 'Inclusions are detailed in the full price and specification pack, available on request.' },
  { q: 'When is completion?', a: 'The construction timeline and completion date are confirmed in the investment pack.' },
  { q: 'Is furniture included?', a: 'Furnishing details are confirmed in the specification pack.' },
  { q: 'What are the annual costs?', a: 'Annual running and management costs are set out in the investment pack.' },
];

export function FaqSection() {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 60);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  return (
    <section id="faq" ref={ref} style={{
      background: 'transparent', position: 'relative',
      padding: 'clamp(48px,6vw,84px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <style>{`
        .faq-a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.4s cubic-bezier(0.16,1,0.3,1); }
        .faq-a.open { grid-template-rows: 1fr; }
        .faq-a > div { overflow: hidden; }
        .faq-q svg { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
        .faq-q[data-open="true"] svg { transform: rotate(45deg); }
      `}</style>

      <span className="reveal" style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(12px,1.6vw,18px)' }}>Investor FAQ</span>
      <h2 className="reveal" style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(26px,3.4vw,44px)', lineHeight: 1.08, letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(26px,3.2vw,40px)' }}>
        Questions, <em className="gold-text" style={{ fontStyle: 'normal' }}>answered.</em>
      </h2>

      <div className="reveal" style={{ maxWidth: 820 }}>
        {faqs.map(({ q, a }, i) => {
          const isOpen = open === i;
          return (
            <div key={q} style={{ borderBottom: '1px solid rgba(201,169,110,0.14)' }}>
              <button
                className="faq-q"
                data-open={isOpen ? 'true' : 'false'}
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  padding: 'clamp(14px,1.7vw,19px) 0',
                  fontFamily: ff, fontWeight: 400, fontSize: 'clamp(15px,1.5vw,19px)',
                  color: isOpen ? 'var(--cream)' : 'var(--cr70)',
                  transition: 'color 0.3s',
                }}
              >
                {q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true">
                  <path d="M8 2v12M2 8h12" />
                </svg>
              </button>
              <div className={`faq-a${isOpen ? ' open' : ''}`}>
                <div>
                  <p style={{ fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(13px,1.2vw,15px)', lineHeight: 1.8, color: 'var(--cr70)', margin: '0', padding: '0 0 clamp(20px,2.4vw,28px)', maxWidth: 660 }}>{a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

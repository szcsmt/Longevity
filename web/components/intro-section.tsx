'use client';

import { useEffect, useRef } from 'react';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* "Discover" — a short intro under the hero. Kept the copy, but gave it life:
   gold-accented keywords, a gold rule that draws itself in on reveal, a slightly
   bolder headline and an ambient glow, so it doesn't read as flat grey text. */
export function IntroSection() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 140);
        obs.disconnect();
      }, { threshold: 0.12 });
      obs.observe(el);
    });
  }, []);

  return (
    <section id="about" ref={ref} style={{
      background: 'transparent', position: 'relative', isolation: 'isolate', overflow: 'hidden',
      padding: 'clamp(80px,11vw,160px) clamp(24px,7vw,96px)',
    }}>
      <style>{`
        .disc-rule { width: 0 !important; transition: width 1.3s cubic-bezier(0.16,1,0.3,1) 0.35s, opacity 1s ease 0.35s; }
        .disc-rule.in { width: clamp(60px,8vw,120px) !important; }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{ top: '-2%', left: '50%', transform: 'translateX(-50%)', width: 'min(700px,84vw)', height: 'min(700px,84vw)', opacity: 0.5 }} />

      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

        <span className="reveal" style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.36em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(18px,2.4vw,28px)' }}>
          {t('locThailand')}
        </span>

        <h2 className="reveal" style={{
          fontFamily: ff, fontWeight: 400, fontSize: 'clamp(33px,5.2vw,68px)',
          lineHeight: 1.08, letterSpacing: '-0.02em', color: 'var(--cream)',
          margin: 0,
        }}>
          {richText(t('discover.headline'), { fontStyle: 'normal', filter: 'drop-shadow(0 0 30px var(--gold-glow))' })}
        </h2>

        <span className="reveal disc-rule" aria-hidden="true" style={{ display: 'block', height: 1, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)', margin: 'clamp(28px,3.4vw,44px) 0' }} />

        <p className="reveal" style={{
          fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(15px,1.8vw,21px)',
          lineHeight: 1.8, color: 'var(--cream)', opacity: 0.88, margin: 0, maxWidth: '32em',
        }}>
          {richText(t('discover.desc'))}
        </p>
      </div>
    </section>
  );
}

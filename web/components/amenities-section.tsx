'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Lightbulb } from 'lucide-react';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

type IconProps = { size?: number; strokeWidth?: number };

/* Icons live in /public/amenity-icons as single-colour SVGs. We paint them with a
   CSS mask so they inherit the dot's `currentColor` and flip dark on the active
   (gold) state — exactly like the old inline icons did. Circadian Lighting has no
   custom SVG yet, so it keeps a lucide component as a fallback. */
const IC = '/amenity-icons';

interface Hotspot {
  x: number;            // % from left
  y: number;            // % from top
  icon: string | ComponentType<IconProps>;   // SVG url (masked) or a lucide component
  titleKey: string;
  bodyKey: string;
}

/* Positions tuned to the heals-you render (open villa, pool, interior). */
const hotspots: Hotspot[] = [
  { x: 38, y: 15, icon: Lightbulb,                          titleKey: 'am.h1.t', bodyKey: 'am.h1.b' },
  { x: 20, y: 44, icon: `${IC}/filtered-water.svg`,        titleKey: 'am.h2.t', bodyKey: 'am.h2.b' },
  { x: 63, y: 28, icon: `${IC}/full-blackout.svg`,         titleKey: 'am.h3.t', bodyKey: 'am.h3.b' },
  { x: 49, y: 58, icon: `${IC}/soundproof.svg`,            titleKey: 'am.h4.t', bodyKey: 'am.h4.b' },
  { x: 85, y: 20, icon: `${IC}/central-cooling.svg`,       titleKey: 'am.h5.t', bodyKey: 'am.h5.b' },
  { x: 90, y: 54, icon: `${IC}/mobile-sauna.svg`,          titleKey: 'am.h6.t', bodyKey: 'am.h6.b' },
  { x: 18, y: 80, icon: `${IC}/ice-bath.svg`,              titleKey: 'am.h7.t', bodyKey: 'am.h7.b' },
  { x: 40, y: 78, icon: `${IC}/natural.svg`,               titleKey: 'am.h8.t', bodyKey: 'am.h8.b' },
  { x: 77, y: 80, icon: `${IC}/smart-health-tracking.svg`, titleKey: 'am.h9.t', bodyKey: 'am.h9.b' },
];

export function AmenitiesSection() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (i: number) => { if (hideTimer.current) clearTimeout(hideTimer.current); setActive(i); };
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), 650);
  };

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 100);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  const cur = active !== null ? hotspots[active] : null;

  return (
    <section ref={ref} style={{
      background: 'transparent',
      padding: 'clamp(70px,8vw,110px) clamp(24px,8vw,120px) clamp(90px,11vw,140px)',
      position: 'relative', overflow: 'hidden', isolation: 'isolate',
    }}>

      <style>{`
        @keyframes hsPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,169,110,0.45); } 70% { box-shadow: 0 0 0 14px rgba(201,169,110,0); } }
        .hs-dot { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), background 0.3s, border-color 0.3s; }
        .hs-dot:hover { transform: translate(-50%,-50%) scale(1.12); }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{
        top: '6%', left: '-5%', width: 'min(520px,55vw)', height: 'min(520px,55vw)',
      }} />

      {/* Label */}
      <span className="reveal" style={{
        display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
        letterSpacing: '0.30em', textTransform: 'uppercase',
        color: 'var(--gold)', opacity: 0.65, marginBottom: 'clamp(28px,3.5vw,44px)',
      }}>{t('am.label')}</span>

      {/* Headline */}
      <h2 className="reveal" style={{
        fontFamily: ff, fontWeight: 400, fontSize: 'clamp(34px,5.8vw,84px)',
        lineHeight: 1.12, letterSpacing: '-0.01em', color: 'var(--cream)',
        margin: '0 0 clamp(20px,2.5vw,32px)', maxWidth: '14em',
        textWrap: 'balance',
      }}>
        {richText(t('am.headline'), { fontStyle: 'normal' })}
      </h2>

      <p className="reveal" style={{
        fontFamily: ff, fontStyle: 'normal', fontSize: 'clamp(14px,1.4vw,18px)',
        lineHeight: 1.8, color: 'var(--cr40)', margin: '0 0 clamp(44px,5vw,64px)', maxWidth: 520,
      }}>
        {t('am.sub')}
      </p>

      {/* Interactive image */}
      <div className="reveal elev-img lr-amenities-canvas" style={{
        position: 'relative', width: '100%',
        aspectRatio: '16 / 9', overflow: 'hidden',
        borderRadius: 'clamp(12px,1.4vw,20px)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/heals-you.webp"
          alt="A Longevity Resort villa interior"
          loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.82) saturate(1.05)' }}
        />
        {/* subtle darkening for dot/label legibility */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 100% at 50% 50%, transparent 40%, rgba(6,14,8,0.45) 100%)',
        }} />

        {/* Hotspot dots */}
        {hotspots.map((h, i) => {
          const Ic = h.icon;
          const on = i === active;
          return (
            <button
              key={h.titleKey}
              className="hs-dot"
              aria-label={t(h.titleKey)}
              onMouseEnter={() => show(i)}
              onMouseLeave={scheduleHide}
              onClick={() => show(i)}
              style={{
                position: 'absolute', left: `${h.x}%`, top: `${h.y}%`,
                transform: 'translate(-50%,-50%)',
                width: 38, height: 38, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', zIndex: on ? 6 : 4,
                background: on ? 'var(--gold)' : 'rgba(6,14,8,0.55)',
                border: `1px solid ${on ? 'var(--gold)' : 'rgba(201,169,110,0.65)'}`,
                color: on ? 'var(--bg)' : 'var(--gold)',
                backdropFilter: 'blur(6px)',
                animation: on ? 'none' : 'hsPulse 2.6s ease-out infinite',
                animationDelay: `${i * 0.35}s`,
              }}
            >
              {typeof Ic === 'string' ? (
                <span aria-hidden="true" style={{
                  width: 18, height: 18, display: 'block', backgroundColor: 'currentColor',
                  WebkitMaskImage: `url(${Ic})`, maskImage: `url(${Ic})`,
                  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center', maskPosition: 'center',
                  WebkitMaskSize: 'contain', maskSize: 'contain',
                }} />
              ) : (
                <Ic size={16} strokeWidth={1.6} />
              )}
            </button>
          );
        })}

        {/* Floating detail card — only while a dot is hovered/active, anchored per quadrant */}
        {cur && active !== null && (
        <div
          key={active}
          style={{
            position: 'absolute', zIndex: 7, pointerEvents: 'none',
            maxWidth: 'min(300px, 76%)',
            left:  cur.x > 55 ? undefined : `calc(${cur.x}% + 30px)`,
            right: cur.x > 55 ? `calc(${100 - cur.x}% + 30px)` : undefined,
            top:   cur.y > 60 ? undefined : `calc(${cur.y}% - 8px)`,
            bottom:cur.y > 60 ? `calc(${100 - cur.y}% - 8px)` : undefined,
            background: 'linear-gradient(160deg, rgba(10,22,14,0.92), rgba(6,14,8,0.92))',
            border: '1px solid rgba(201,169,110,0.30)',
            boxShadow: '0 30px 70px -24px rgba(0,0,0,0.85), 0 0 40px -12px var(--gold-glow)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12, padding: 'clamp(16px,1.6vw,22px)',
            animation: 'fadeIn 0.3s ease both',
          }}
        >
          <span style={{
            display: 'block', fontFamily: ffs, fontSize: 7.5, fontWeight: 300,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--gold)', opacity: 0.75, marginBottom: 8,
          }}>0{active + 1} / 0{hotspots.length}</span>
          <h3 style={{
            fontFamily: ff, fontWeight: 400, fontStyle: 'normal',
            fontSize: 'clamp(17px,1.8vw,24px)', lineHeight: 1.2,
            color: 'var(--cream)', margin: '0 0 8px',
          }}>{t(cur.titleKey)}</h3>
          <p style={{
            fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(11px,0.95vw,13px)',
            lineHeight: 1.75, color: 'var(--cr70)', margin: 0,
          }}>{t(cur.bodyKey)}</p>
        </div>
        )}
      </div>

    </section>
  );
}

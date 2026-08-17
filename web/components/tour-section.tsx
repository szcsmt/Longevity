'use client';

import { useState, useEffect } from 'react';
import { Tour3D } from '@/components/tour-3d';
import { useT, richText } from '@/lib/i18n';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

/* ─── The 3D Twin, at estate level ───

   The twin used to be reachable only from inside a villa modal, two clicks deep
   and always pointed at one interior — so the part that actually shows the
   project (the whole estate, every residence on it, what is still available)
   was the part nobody saw. This section is that view's front door.

   The viewer is NOT mounted on load. It is a third-party WebGL app that pulls a
   lot behind it, so the section shows a still of the model and only builds the
   real thing when someone asks for it. That keeps the page fast and means no
   third-party request leaves the browser until the visitor has chosen to make
   one. The still is a frame of the twin itself, not a render — what you see is
   what opens. */
const POSTER   = '/images/tour-poster.webp';
const POSTER_M = '/images/tour-poster-m.webp';

/* The cube that already stands for "3D" elsewhere on the site (villa dialog). */
function CubeIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.6 14 5v6L8 14.4 2 11V5z" />
      <path d="M2 5l6 3.4L14 5" />
      <path d="M8 8.4v6" />
    </svg>
  );
}

export function TourSection() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Escape closes, and the page underneath stays put while the viewer is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <style>{`
        /* Gold frame + halo, same language as the villa stage. Intensity animates
           with OPACITY only, so hovering never triggers a repaint. */
        .tour-stage { position: relative; border-radius: clamp(16px,1.6vw,24px); overflow: hidden;
          display: block; width: 100%; padding: 0; border: none; background: #0A1A0D;
          cursor: pointer; aspect-ratio: 16 / 9;
          transition: transform 0.5s cubic-bezier(0.16,1,0.3,1); will-change: transform; }
        .tour-stage::before {
          content: ''; position: absolute; inset: -3px; border-radius: inherit;
          border: 1.5px solid rgba(232,201,138,0.7);
          box-shadow: 0 0 90px -4px rgba(201,169,110,0.42), 0 44px 100px -34px rgba(0,0,0,0.9);
          pointer-events: none; z-index: 6; opacity: 0.62;
          transition: opacity 0.5s cubic-bezier(0.16,1,0.3,1); will-change: opacity; }
        .tour-stage:hover { transform: translateY(-6px); }
        .tour-stage:hover::before { opacity: 1; }
        .tour-stage img { width: 100%; height: 100%; object-fit: cover; display: block;
          transition: transform 1.2s cubic-bezier(0.16,1,0.3,1); }
        .tour-stage:hover img { transform: scale(1.03); }
        .tour-play { transition: background 0.4s, border-color 0.4s, color 0.4s, transform 0.4s cubic-bezier(0.16,1,0.3,1); }
        .tour-stage:hover .tour-play { background: var(--gold); border-color: var(--gold); color: #0A1A0D; transform: scale(1.06); }
        @media (prefers-reduced-motion: reduce) {
          .tour-stage, .tour-stage img, .tour-play { transition: none; }
          .tour-stage:hover { transform: none; }
          .tour-stage:hover img { transform: none; }
        }
      `}</style>

      <section id="tour" style={{
        background: 'transparent',
        padding: 'clamp(80px,9vw,130px) clamp(24px,6vw,80px)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 'clamp(32px,4vw,52px)', maxWidth: 720 }}>
            <span style={{
              display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300,
              letterSpacing: '0.28em', textTransform: 'uppercase',
              color: 'var(--gold)', opacity: 0.65, marginBottom: 14,
            }}>{t('tour.eyebrow')}</span>
            <h2 style={{
              fontFamily: ff, fontWeight: 400, fontSize: 'clamp(28px,3.5vw,50px)',
              color: 'var(--cream)', lineHeight: 1.12, margin: '0 0 clamp(18px,2vw,26px)',
            }}>
              {richText(t('tour.headline'), { fontStyle: 'normal', color: 'var(--gold)' })}
            </h2>
            <p style={{
              fontFamily: ff, fontSize: 'clamp(15px,1.35vw,18px)', lineHeight: 1.75,
              color: 'var(--cr70)', margin: 0,
            }}>{t('tour.body')}</p>
          </div>

          {/* The stage — a still of the twin, which becomes the twin on click */}
          <button
            type="button"
            className="tour-stage"
            onClick={() => setOpen(true)}
            aria-label={t('tour.cta')}
            data-track="Opened the 3D estate tour"
          >
            <picture>
              <source media="(max-width: 700px)" srcSet={POSTER_M} />
              <img src={POSTER} alt={t('tour.posterAlt')} loading="lazy" decoding="async" />
            </picture>

            {/* The model is rendered on a near-white ground, so the label needs a real
                scrim under it, not a hint of one: bottom-up for the whole strip, plus
                a left wash where the cube and the words actually sit. */}
            <span aria-hidden="true" style={{
              position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
              background: 'linear-gradient(to top, rgba(6,14,8,0.92) 0%, rgba(6,14,8,0.55) 22%, rgba(6,14,8,0.10) 48%, transparent 68%),'
                        + 'linear-gradient(to right, rgba(6,14,8,0.55) 0%, rgba(6,14,8,0.12) 28%, transparent 52%)',
            }} />

            {/* Play affordance + label, bottom-left */}
            <span style={{
              position: 'absolute', left: 'clamp(18px,2.4vw,34px)', bottom: 'clamp(18px,2.4vw,34px)',
              zIndex: 3, display: 'flex', alignItems: 'center', gap: 'clamp(12px,1.4vw,18px)',
              textAlign: 'left', pointerEvents: 'none',
            }}>
              <span className="tour-play" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 'clamp(48px,4.4vw,60px)', height: 'clamp(48px,4.4vw,60px)',
                borderRadius: '50%', flexShrink: 0,
                border: '1px solid rgba(232,201,138,0.75)', color: 'var(--gold)',
                background: 'rgba(6,14,8,0.55)', backdropFilter: 'blur(6px)',
                boxShadow: '0 0 30px -8px var(--gold-glow)',
              }}>
                <CubeIcon />
              </span>
              <span style={{ display: 'block' }}>
                <span style={{
                  display: 'block', fontFamily: ff, fontWeight: 400,
                  fontSize: 'clamp(17px,1.9vw,24px)', color: 'var(--cream)', lineHeight: 1.2,
                }}>{t('tour.cta')}</span>
                <span style={{
                  display: 'block', marginTop: 6, fontFamily: ffs, fontSize: 8, fontWeight: 300,
                  letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8,
                }}>{t('tour.stageNote')}</span>
              </span>
            </span>
          </button>

          <p style={{
            fontFamily: ffs, fontSize: 'clamp(10px,1vw,12px)', fontWeight: 300,
            letterSpacing: '0.06em', color: 'var(--cr40)',
            margin: 'clamp(16px,1.8vw,22px) 0 0',
          }}>{t('tour.hint')}</p>
        </div>
      </section>

      {/* Fullscreen viewer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('tour.cta')}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(6,14,8,0.97)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'clamp(12px,3vw,40px)', animation: 'fadeIn 0.3s ease both',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 1480, height: 'min(90vh, 940px)',
            background: '#0A1A0D', border: '1px solid rgba(201,169,110,0.25)',
            borderRadius: 'clamp(12px,1.4vw,20px)', overflow: 'hidden', position: 'relative',
            boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow)',
          }}>
            <Tour3D />
          </div>

          {/* Close — outside the frame so it never sits on the viewer's own chrome */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('tour.close')}
            data-notrack
            style={{
              position: 'fixed', top: 'clamp(14px,2vw,26px)', right: 'clamp(14px,2vw,26px)',
              zIndex: 2001, width: 44, height: 44, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(6,14,8,0.7)', border: '1px solid rgba(201,169,110,0.4)',
              color: 'var(--cream)', cursor: 'pointer', backdropFilter: 'blur(6px)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

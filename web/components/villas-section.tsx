'use client';

import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { ArrowUpRight, Maximize2 } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface VillaData {
  index: string;
  name: string;
  size: string;
  bedrooms: string;
  guests: string;
  pool: string;
  tagline: string;
  desc: string;
  highlights: string[];
  img: string;
  gallery: { src: string; caption: string }[];
  alt: string;
}

const villas: VillaData[] = [
  {
    index: '01', name: 'Villa M', size: '76.46 m²',
    bedrooms: '1 Bedroom', guests: 'Up to 2 Guests', pool: 'Private plunge pool',
    tagline: 'Intimate seclusion. Full privacy.',
    desc: 'One bedroom. Private plunge pool. Surrounded by ancient jungle, steps from the shoreline.',
    highlights: ['Private garden terrace', 'Open-air bathroom', 'Daily housekeeping'],
    img: '/images/villa/ext-1.webp',
    gallery: [
      { src: '/images/villa/ext-1.webp',        caption: 'Exterior · golden hour' },
      { src: '/images/villa/int-living-1.webp', caption: 'Living room' },
      { src: '/images/villa/int-bedroom-1.webp',caption: 'Bedroom' },
      { src: '/images/villa/int-kitchen-1.webp',caption: 'Kitchen' },
      { src: '/images/villa/int-bathroom-1.webp',caption: 'Bathroom' },
    ],
    alt: 'Villa M exterior',
  },
  {
    index: '02', name: 'Villa L', size: '79.19 m²',
    bedrooms: '1 Bedroom', guests: 'Up to 2 Guests', pool: '12 m private pool',
    tagline: 'Elevated living. Sea horizon.',
    desc: 'One spacious bedroom. A 12-metre pool facing the open sea. A view that resets everything.',
    highlights: ['Panoramic ocean terrace', 'Spa access included', 'Concierge 24/7', 'Sunset sala'],
    img: '/images/villa/ext-2.webp',
    gallery: [
      { src: '/images/villa/ext-2.webp',         caption: 'Exterior · pool & terrace' },
      { src: '/images/villa/ext-3.webp',         caption: 'Poolside' },
      { src: '/images/villa/int-living-2.webp',  caption: 'Living room' },
      { src: '/images/villa/int-bedroom-2.webp', caption: 'Bedroom' },
      { src: '/images/villa/int-kitchen-2.webp', caption: 'Kitchen' },
      { src: '/images/villa/int-bathroom-2.webp',caption: 'Bathroom' },
    ],
    alt: 'Villa L exterior',
  },
  {
    index: '03', name: 'Villa XL', size: '126.65 m²',
    bedrooms: '2 Bedrooms', guests: 'Up to 4 Guests', pool: 'Heated infinity pool',
    tagline: 'The estate. The pinnacle.',
    desc: 'Two bedrooms. Heated infinity pool. Dedicated butler. The most secluded residence on the estate.',
    highlights: ['Private butler service', 'Full kitchen', 'Meditation pavilion', 'Outdoor cinema'],
    img: '/images/villa/ext-4.webp',
    gallery: [
      { src: '/images/villa/ext-4.webp',            caption: 'Exterior' },
      { src: '/images/villa/ext-5.webp',            caption: 'Evening' },
      { src: '/images/villa/ext-6.webp',            caption: 'Garden view' },
      { src: '/images/villa/int-living-3.webp',     caption: 'Living room' },
      { src: '/images/villa/int-living-4.webp',     caption: 'Lounge' },
      { src: '/images/villa/int-bedroom-3.webp',    caption: 'Bedroom' },
      { src: '/images/villa/int-bedroom-living.webp',caption: 'Bedroom & living' },
      { src: '/images/villa/int-bathroom-3.webp',   caption: 'Bathroom' },
    ],
    alt: 'Villa XL exterior',
  },
];

/* ─── Image Carousel ─── */
function VillaImageCarousel({
  villas: vs, active, onNavigate, onExplore,
}: {
  villas: VillaData[];
  active: number;
  onNavigate: (idx: number) => void;
  onExplore: () => void;
}) {
  const n      = vs.length;
  const prevIdx = ((active - 1) % n + n) % n;
  const nextIdx = (active + 1) % n;

  // Slot wrapper — animated via direct style mutations
  const wrapRef      = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(active);
  const isDragging   = useRef(false);
  const startX       = useRef(0);

  // Animate slot transition when active changes
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || prevActiveRef.current === active) return;

    const from = prevActiveRef.current;
    // +100% = coming from prev (new current slides in from LEFT)
    // -100% = coming from next (new current slides in from RIGHT)
    const isNext = active === ((from + 1) % n);
    const shift  = isNext ? 100 : -100;

    // Snap to faked "old" position before paint
    el.style.transition = 'none';
    el.style.transform  = `translateX(${shift}%)`;

    // Then animate into place
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.55s cubic-bezier(0.16,1,0.3,1)';
        el.style.transform  = 'translateX(0)';
      })
    );

    prevActiveRef.current = active;
  }, [active, n]);

  // Pointer/touch drag handlers — direct DOM, no state re-renders
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging.current) return;
    // Don't start a drag (and don't capture the pointer) when pressing a
    // control — otherwise pointer-capture swallows the button's click.
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    isDragging.current = true;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const dx = e.clientX - startX.current;
    const el = wrapRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform  = `translateX(${dx}px)`;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx  = e.clientX - startX.current;
    const el  = wrapRef.current;
    const THR = 60;

    if (dx < -THR) {
      onNavigate(nextIdx);
    } else if (dx > THR) {
      onNavigate(prevIdx);
    } else {
      // A tap (not a drag) on the image opens the villa details
      if (Math.abs(dx) < 8) onExplore();
      if (el) {
        el.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1)';
        el.style.transform  = 'translateX(0)';
      }
    }
  }

  function onPointerCancel() {
    isDragging.current = false;
    const el = wrapRef.current;
    if (el) {
      el.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1)';
      el.style.transform  = 'translateX(0)';
    }
  }

  const arrowStyle: React.CSSProperties = {
    flexShrink: 0, width: 'clamp(40px,4vw,54px)', height: 'clamp(40px,4vw,54px)', borderRadius: '50%',
    border: '1px solid rgba(201,169,110,0.5)', background: 'rgba(6,14,8,0.4)', backdropFilter: 'blur(8px)',
    color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.35s, color 0.35s, border-color 0.35s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,1.4vw,18px)', width: '100%' }}>

      {/* Previous villa — OUTSIDE the frame (switch villa type) */}
      <button aria-label="Previous villa" onClick={() => onNavigate(prevIdx)} style={arrowStyle}
        onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(6,14,8,0.4)'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.5)'; }}>
        <svg width="14" height="14" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2L4 6.5L9 11" /></svg>
      </button>

    <div className="villa-stage" style={{ position: 'relative', flex: 1, minWidth: 0 }}>

    <div
      className="villa-carousel elev-img"
      style={{
        position: 'relative', overflow: 'hidden',
        height: 'clamp(420px,64vh,700px)',
        borderRadius: 'clamp(14px,1.4vw,22px)',
        touchAction: 'pan-y',
        userSelect: 'none',
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Three-slot wrapper — all slots translate together */}
      <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
        {([
          { img: vs[prevIdx], slotKey: 'prev', offset: '-100%' },
          { img: vs[active],  slotKey: 'curr', offset: '0%'    },
          { img: vs[nextIdx], slotKey: 'next', offset: '100%'  },
        ] as const).map(({ img, slotKey, offset }) => (
          <div
            key={slotKey}
            style={{
              position: 'absolute', top: 0, left: offset,
              width: '100%', height: '100%', overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.img}
              alt={img.alt}
              draggable={false}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                filter: 'brightness(0.96) saturate(1.12)',
                pointerEvents: 'none',
                display: 'block',
              }}
            />
          </div>
        ))}
      </div>

      {/* Depth gradient overlay */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: 'linear-gradient(to top, rgba(6,14,8,0.55) 0%, transparent 32%, transparent 78%, rgba(6,14,8,0.22) 100%)',
      }} />

      {/* Center explore affordance — "click the image to view this villa" */}
      <div className="villa-explore" aria-hidden="true" style={{
        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'clamp(12px,1.4vw,18px)',
      }}>
        <span className="villa-explore-ring" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 'clamp(62px,7vw,86px)', height: 'clamp(62px,7vw,86px)', borderRadius: '50%',
          border: '1.5px solid rgba(232,201,138,0.9)',
          background: 'rgba(6,14,8,0.34)', backdropFilter: 'blur(6px)',
          color: 'var(--gold)',
          boxShadow: '0 0 46px -6px rgba(201,169,110,0.6)',
        }}>
          <Maximize2 size={28} strokeWidth={1.4} />
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 100,
          background: 'rgba(6,14,8,0.6)', border: '1px solid rgba(201,169,110,0.35)', backdropFilter: 'blur(8px)',
          fontFamily: ffs, fontSize: 'clamp(10px,1vw,12px)', fontWeight: 400,
          letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--w90)',
          textShadow: '0 1px 12px rgba(6,14,8,0.9)',
        }}>
          View villa <ArrowUpRight size={13} />
        </span>
      </div>

      {/* Index watermark — bottom left */}
      <span style={{
        position: 'absolute', bottom: 14, left: 16,
        fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em',
        color: 'rgba(228,217,195,0.22)', userSelect: 'none',
        zIndex: 10,
      }}>{vs[active].index} / 0{n}</span>
    </div>

    </div>

      {/* Next villa — OUTSIDE the frame (switch villa type) */}
      <button aria-label="Next villa" onClick={() => onNavigate(nextIdx)} style={arrowStyle}
        onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'rgba(6,14,8,0.4)'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.5)'; }}>
        <svg width="14" height="14" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2l5 4.5L4 11" /></svg>
      </button>

    </div>
  );
}

/* ─── Modal ─── */
function VillaModal({ villa, onClose }: { villa: VillaData; onClose: () => void }) {
  const [img, setImg] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowRight') setImg(i => (i + 1) % villa.gallery.length);
      if (e.key === 'ArrowLeft')  setImg(i => (i - 1 + villa.gallery.length) % villa.gallery.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, villa.gallery.length]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(6,14,8,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(16px,4vw,48px)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.3s ease both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="lr-split"
        style={{
          width: '100%', maxWidth: 1080, maxHeight: '90vh', overflow: 'auto',
          background: '#0A1A0D',
          border: '1px solid rgba(201,169,110,0.20)',
          borderRadius: 'clamp(16px,1.8vw,24px)',
          boxShadow: '0 50px 120px -30px rgba(0,0,0,0.9), 0 0 60px -10px var(--gold-glow), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'grid', gridTemplateColumns: '1fr 380px',
          position: 'relative',
        }}
      >
        {/* Gallery */}
        <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 280, overflow: 'hidden', isolation: 'isolate' }}>
            {villa.gallery.map((g, i) => (
              <img key={i} src={g.src} alt={g.caption} decoding="async" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                opacity: i === img ? 1 : 0,
                transition: 'opacity 0.4s ease',
                willChange: 'opacity',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
              }} />
            ))}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(6,14,8,0.8), transparent)', padding: '20px 20px 14px' }}>
              <span style={{ fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.16em', color: 'var(--cr70)' }}>{villa.gallery[img].caption}</span>
            </div>
            {villa.gallery.length > 1 && <>
              <button onClick={() => setImg(i => (i - 1 + villa.gallery.length) % villa.gallery.length)}
                style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', width:34, height:34, borderRadius:'50%', border:'1px solid rgba(201,169,110,0.30)', background:'rgba(6,14,8,0.6)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round"><path d="M7 1L3 5l4 4"/></svg>
              </button>
              <button onClick={() => setImg(i => (i + 1) % villa.gallery.length)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', width:34, height:34, borderRadius:'50%', border:'1px solid rgba(201,169,110,0.30)', background:'rgba(6,14,8,0.6)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round"><path d="M3 1l4 4-4 4"/></svg>
              </button>
            </>}
          </div>
          <div style={{ display: 'flex', gap: 6, background: '#071009', padding: 8 }}>
            {villa.gallery.map((g, i) => (
              <button key={i} onClick={() => setImg(i)}
                style={{ flex: 1, height: 56, overflow: 'hidden', border: 'none', borderRadius: 8, padding: 0, cursor: 'pointer', opacity: img === i ? 1 : 0.40, transition: 'opacity 0.3s', outline: img === i ? '2px solid var(--gold)' : 'none', outlineOffset: -2 }}>
                <img src={g.src} alt={g.caption} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', borderLeft: '1px solid rgba(228,217,195,0.06)' }}>
          <div>
            <span style={{ display:'block', fontFamily: ffs, fontSize: 8, fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>{villa.name}</span>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontStyle: 'italic', fontSize: 'clamp(26px,3vw,40px)', lineHeight: 1.12, color: 'var(--cream)', margin: '0 0 6px' }}>{villa.name}</h3>
            <p style={{ fontFamily: ffs, fontSize: 10, fontWeight: 300, letterSpacing: '0.10em', color: 'var(--gold)', margin: 0, opacity: 0.8 }}>{villa.tagline}</p>
          </div>
          <span style={{ display: 'block', width: 28, height: 1, background: 'var(--gold-40)' }} />
          <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.85, color: 'var(--cr70)', margin: 0 }}>{villa.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.08)', borderRadius: 12, overflow: 'hidden' }}>
            {[{k:'Size',v:villa.size},{k:'Rooms',v:villa.bedrooms},{k:'Guests',v:villa.guests},{k:'Pool',v:villa.pool}].map(({k,v}) => (
              <div key={k} style={{ padding: '12px 14px', background: 'rgba(6,14,8,0.6)' }}>
                <span style={{ display: 'block', fontFamily: ffs, fontSize: 7, fontWeight: 300, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: 3 }}>{k}</span>
                <span style={{ fontFamily: ff, fontSize: 'clamp(12px,1.2vw,14px)', color: 'var(--cream)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 7, fontWeight: 300, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, marginBottom: 12 }}>Highlights</span>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {villa.highlights.map(h => (
                <li key={h} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'block', width: 14, height: 1, background: 'var(--gold-65)', flexShrink: 0 }} />
                  <span style={{ fontFamily: ff, fontSize: 13, color: 'var(--cr70)', fontStyle: 'italic' }}>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <a href="#reserve" onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 'auto',
              fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.26em', textTransform: 'uppercase',
              color: 'var(--gold)', background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
              borderRadius: 100, padding: '16px 28px', textDecoration: 'none',
              transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
              animation: 'goldGlow 3.4s ease-in-out infinite',
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
          >Reserve This Villa</a>
        </div>

        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" style={{ position: 'fixed', top: 'clamp(16px,3vw,28px)', right: 'clamp(16px,3vw,28px)', zIndex: 1001, width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(228,217,195,0.30)', background: 'rgba(6,14,8,0.85)', backdropFilter: 'blur(8px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 10 10" fill="none" stroke="var(--cream)" strokeWidth="1.3" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Main Section ─── */
export function VillasSection() {
  const [active, setActive] = useState(0);
  const [modal,  setModal]  = useState<VillaData | null>(null);
  const n = villas.length;

  const navigate = useCallback((idx: number) => {
    setActive(((idx % n) + n) % n);
  }, [n]);

  const villa = villas[active];

  return (
    <>
      <style>{`
        @keyframes vexpand { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }
        .villa-explore-ring { animation: vexpand 2.4s ease-in-out infinite; }
        .villa-stage:hover .villa-explore { opacity: 0; }
        .villa-explore { transition: opacity 0.45s ease; }
        .vdot { border:none; cursor:pointer; padding:0; transition: width 0.45s cubic-bezier(0.16,1,0.3,1), background 0.3s; }
        .villa-stage { border-radius: clamp(16px,1.6vw,24px); transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
        /* Static gold frame + soft glow halo — lifts the villa off the dark backdrop */
        .villa-stage::before {
          content: ''; position: absolute; inset: -3px; border-radius: inherit;
          border: 1.5px solid rgba(201,169,110,0.5);
          box-shadow: 0 0 60px -6px var(--gold-glow), 0 34px 84px -34px rgba(0,0,0,0.85);
          pointer-events: none; z-index: 6;
          transition: border-color 0.6s cubic-bezier(0.16,1,0.3,1), box-shadow 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        .villa-carousel { transition: box-shadow 0.6s cubic-bezier(0.16,1,0.3,1); }
        .villa-stage:hover { transform: translateY(-8px) scale(1.025); }
        .villa-stage:hover::before { border-color: rgba(232,201,138,0.8); box-shadow: 0 0 92px -4px rgba(201,169,110,0.42), 0 44px 100px -34px rgba(0,0,0,0.9); }
        .villa-stage:hover .villa-carousel { box-shadow: 0 55px 120px -30px rgba(0,0,0,0.9); }
      `}</style>

      <section id="villas" style={{
        background: 'transparent',
        padding: 'clamp(80px,9vw,130px) clamp(24px,8vw,120px) clamp(80px,10vw,120px)',
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>

        {/* Section header — title only, arrows moved to image */}
        <div style={{ marginBottom: 'clamp(44px,6vw,72px)' }}>
          <span style={{ display:'block', fontFamily:ffs, fontSize:9, fontWeight:300, letterSpacing:'0.28em', textTransform:'uppercase', color:'var(--gold)', opacity:0.65, marginBottom:14 }}>The Villas</span>
          <h2 style={{ fontFamily:ff, fontWeight:400, fontSize:'clamp(28px,3.5vw,50px)', color:'var(--cream)', lineHeight:1.12, margin:0 }}>
            Three sanctuaries.<br /><em style={{ color:'var(--gold)' }}>One island.</em>
          </h2>
        </div>

        {/* Card: text left + image right */}
        <div className="lr-villa-card" style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 'clamp(28px,3.5vw,56px)', width: '100%',
        }}>

          {/* LEFT: Text */}
          <div style={{ flex: '0 0 clamp(220px,25%,320px)', display: 'flex', flexDirection: 'column' }}>

            <h3 style={{ margin: '0 0 clamp(8px,1.2vw,14px)', lineHeight: 1 }}>
              <span className="gold-text" style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontSize: 'clamp(48px,6vw,88px)', letterSpacing: '-0.01em', lineHeight: 1.0, filter: 'drop-shadow(0 0 24px var(--gold-glow))' }}>{villa.name}</span>
              <span style={{ display: 'block', fontFamily: ff, fontWeight: 400, fontStyle: 'italic', fontSize: 'clamp(17px,2vw,28px)', letterSpacing: '0.01em', color: 'var(--gold)', lineHeight: 1.4 }}>{villa.tagline}</span>
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 22px', margin: 'clamp(16px,2.5vw,28px) 0 clamp(20px,3vw,32px)' }}>
              {[villa.bedrooms, villa.size, villa.guests].map(s => (
                <span key={s} style={{ fontFamily: ffs, fontSize: 'clamp(11px,1.05vw,13px)', fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cream)', borderLeft: '2px solid var(--gold-40)', paddingLeft: 12 }}>{s}</span>
              ))}
            </div>

            <p style={{ fontFamily: ff, fontSize: 'clamp(13px,1.3vw,15px)', lineHeight: 1.85, color: 'var(--cr40)', margin: '0 0 clamp(24px,3.5vw,36px)' }}>{villa.desc}</p>

            <button
              onClick={() => setModal(villa)}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                fontFamily: ffs, fontSize: 9, fontWeight: 300,
                letterSpacing: '0.28em', textTransform: 'uppercase',
                color: 'var(--gold)',
                background: 'transparent', border: '1px solid rgba(201,169,110,0.55)',
                borderRadius: 100, padding: '16px 38px', cursor: 'pointer',
                transition: 'background 0.45s cubic-bezier(0.16,1,0.3,1), color 0.45s, border-color 0.45s',
                animation: 'goldGlow 3.4s ease-in-out infinite',
              }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--gold)'; b.style.color = 'var(--bg)'; b.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(201,169,110,0.55)'; }}
            >
              View Details
              <ArrowUpRight size={14} />
            </button>
          </div>

          {/* RIGHT: Swipe image carousel with arrows */}
          <div style={{ flex: 1 }}>
            <VillaImageCarousel
              villas={villas}
              active={active}
              onNavigate={navigate}
              onExplore={() => setModal(villa)}
            />
          </div>
        </div>

        {/* Dots */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'clamp(36px,5vw,60px)' }}>
          <div style={{ display:'flex', gap:9 }}>
            {villas.map((_, i) => (
              <button
                key={i}
                className="vdot"
                onClick={() => navigate(i)}
                aria-label={`Villa ${i + 1}`}
                style={{
                  height: 7, borderRadius: 4,
                  width: i === active ? 26 : 7,
                  background: i === active ? 'var(--gold)' : 'rgba(201,169,110,0.20)',
                }}
              />
            ))}
          </div>
          <span style={{ fontFamily:ffs, fontSize:8, fontWeight:300, letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(228,217,195,0.20)' }}>
            {villa.name} — {villa.index} / 0{n}
          </span>
        </div>

      </section>

      {modal && <VillaModal villa={modal} onClose={() => setModal(null)} />}
    </>
  );
}

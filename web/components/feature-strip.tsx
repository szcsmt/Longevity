'use client';

import { BedDouble, Waves, ShieldCheck, HeartPulse, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Fact { icon: LucideIcon; label: string; sub: string; }

const facts: Fact[] = [
  { icon: BedDouble,   label: '1–2 BR Villas',    sub: 'Private residences' },
  { icon: Waves,       label: 'Private Pools',    sub: 'Every villa has one' },
  { icon: ShieldCheck, label: 'Gated Entrance',   sub: 'Secure private access' },
  { icon: HeartPulse,  label: 'Longevity Centre', sub: 'Within the resort' },
  { icon: TrendingUp,  label: '10% Fixed ROI',    sub: 'Structured investment return' },
];

/* A compact premium "facts strip" directly under the hero. Five glass cards in one
   row on desktop; a snap horizontal scroll on phones. Kept light, not a table. */
export function FeatureStrip() {
  return (
    <section style={{
      background: 'transparent', position: 'relative', zIndex: 3,
      padding: 'clamp(20px,3vw,40px) clamp(16px,4vw,64px) clamp(28px,4vw,52px)',
    }}>
      <style>{`
        .fs-row { display: flex; gap: clamp(10px,1.2vw,16px); }
        .fs-card {
          flex: 1 0 auto; min-width: clamp(150px,40vw,200px);
          display: flex; flex-direction: column; align-items: center; gap: 9px; text-align: center;
          padding: clamp(18px,1.8vw,24px) clamp(12px,1.4vw,18px);
          border-radius: 14px;
          background: linear-gradient(160deg, rgba(228,217,195,0.06), rgba(228,217,195,0.015));
          border: 1px solid rgba(201,169,110,0.22);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          transition: border-color 0.4s, transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s;
        }
        .fs-card:hover { border-color: rgba(201,169,110,0.5); transform: translateY(-4px);
          box-shadow: 0 24px 50px -26px rgba(0,0,0,0.8), 0 0 30px -14px var(--gold-glow); }
        @media (max-width: 760px) {
          .fs-row { overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px;
            -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .fs-row::-webkit-scrollbar { display: none; }
          .fs-card { scroll-snap-align: start; }
        }
      `}</style>

      <div className="fs-row">
        {facts.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="fs-card">
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              border: '1px solid rgba(201,169,110,0.4)', color: 'var(--gold)',
              background: 'rgba(201,169,110,0.08)',
            }}>
              <Icon size={19} strokeWidth={1.5} />
            </span>
            <span style={{
              fontFamily: ff, fontWeight: 400, fontSize: 'clamp(15px,1.4vw,18px)',
              color: 'var(--cream)', lineHeight: 1.2, letterSpacing: '0.005em',
            }}>{label}</span>
            <span style={{
              fontFamily: ffs, fontSize: 'clamp(8.5px,0.85vw,10px)', fontWeight: 300,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cr40)', lineHeight: 1.4,
            }}>{sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

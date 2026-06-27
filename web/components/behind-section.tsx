'use client';

import { useEffect, useRef } from 'react';
import { Building2, PencilRuler, HardHat, Dumbbell, Microscope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ff  = 'var(--font-playfair), serif';
const ffs = 'var(--font-raleway), sans-serif';

interface Card {
  icon: LucideIcon;
  category: string;
  title: string;
  body: string;
  reference?: string;
}

const cards: Card[] = [
  {
    icon: Building2, category: 'Developer', title: 'Longevity Property Group',
    body: 'Longevity Property Group is the development company behind Longevity Resort. Its role is to bring together land, architecture, construction, wellness operations and investor structure into one coherent residential concept, with a clear focus on design, wellbeing and long-term value.',
  },
  {
    icon: PencilRuler, category: 'Architecture & Interiors', title: 'SVA Architects',
    body: 'SVA Architects, led by Szilvia Viczian, is responsible for the architectural and interior direction of the resort. The design language combines tropical modern architecture, natural materials and calm spatial planning to create villas that feel private, functional and refined.',
  },
  {
    icon: HardHat, category: 'Construction', title: 'Panmas Construction Co., Ltd.',
    body: 'Panmas Construction Co., Ltd. leads the construction of the resort. The build approach focuses on durable materials, precise execution and construction details suitable for Koh Samui’s climate, with experience across resort, hotel and villa developments on the island.',
    reference: 'Selected references include Mantra Samui Resort, Nautilus Samui Hotel & Spa, Istani Villas, Winsent and Replay Koh Samui.',
  },
  {
    icon: Dumbbell, category: 'Wellness Partner', title: 'Legacy Fitness & Spa',
    body: 'Legacy Fitness & Spa supports the resort’s wellness experience through access to fitness, spa and recovery facilities. The offer includes swimming pools, jacuzzi and steam room, traditional sauna, infrared sauna, cold plunge, a fully equipped gym, yoga and movement studio, and private treatment rooms.',
  },
  {
    icon: Microscope, category: 'Longevity Partner', title: 'Specialist Longevity Partners',
    body: 'The longevity program will be supported by specialist partners in diagnostics, performance, recovery and preventive health. Their role is to turn the resort’s wellbeing concept into a structured, measurable resident experience.',
  },
];

export function BehindSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.reveal') ?? [];
    items.forEach((el, i) => {
      const obs = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        setTimeout(() => el.classList.add('in'), i * 90);
        obs.disconnect();
      }, { threshold: 0.06 });
      obs.observe(el);
    });
  }, []);

  return (
    <section id="team" ref={ref} style={{
      background: 'transparent', position: 'relative', isolation: 'isolate', overflow: 'hidden',
      padding: 'clamp(80px,10vw,140px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(201,169,110,0.06)',
    }}>
      <style>{`
        .bh-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(14px,1.6vw,22px); }
        .bh-card {
          flex: 1 1 320px; max-width: 380px;
          display: flex; flex-direction: column;
          padding: clamp(26px,2.6vw,38px);
          border-radius: clamp(12px,1.2vw,18px);
          border: 1px solid var(--glass-border);
          background: linear-gradient(165deg, rgba(228,217,195,0.05), rgba(228,217,195,0.012));
          box-shadow: var(--glass-shadow);
          transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), border-color 0.5s, box-shadow 0.5s;
        }
        .bh-card:hover { transform: translateY(-6px); border-color: rgba(201,169,110,0.42);
          box-shadow: var(--glass-shadow-hover); }
      `}</style>

      <div className="section-glow" aria-hidden="true" style={{ top: '4%', left: '-6%', width: 'min(520px,55vw)', height: 'min(520px,55vw)' }} />

      <span className="reveal" style={{ display: 'block', fontFamily: ffs, fontSize: 9, fontWeight: 300, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: 'clamp(20px,2.5vw,30px)' }}>
        The Team
      </span>
      <h2 className="reveal" style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(34px,5vw,72px)', lineHeight: 1.06, letterSpacing: '-0.015em', color: 'var(--cream)', margin: '0 0 clamp(16px,2vw,22px)' }}>
        Behind the <em className="gold-text" style={{ fontStyle: 'italic' }}>Resort.</em>
      </h2>
      <p className="reveal" style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(15px,1.5vw,20px)', lineHeight: 1.7, color: 'var(--cr70)', margin: '0 0 clamp(18px,2vw,24px)', maxWidth: 760 }}>
        A focused team of specialists brings together development, architecture, construction, wellness and long-term operation.
      </p>
      <p className="reveal" style={{ fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(13px,1.2vw,15px)', lineHeight: 1.85, color: 'var(--cr40)', margin: '0 0 clamp(44px,5.5vw,72px)', maxWidth: 760 }}>
        Longevity Resort is shaped by a focused group of specialists, each responsible for a different
        part of the experience: development, architecture, interiors, construction, wellness and
        long-term operation. The result is a residential resort designed to feel coherent from the
        first architectural line to the daily owner experience.
      </p>

      <div className="bh-grid reveal">
        {cards.map(({ icon: Icon, category, title, body, reference }) => (
          <article key={title} className="bh-card">
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: '50%', border: '1px solid rgba(201,169,110,0.3)', color: 'var(--gold)', marginBottom: 'clamp(18px,2vw,24px)' }}>
              <Icon size={20} strokeWidth={1.4} />
            </span>
            <span style={{ display: 'block', fontFamily: ffs, fontSize: 8.5, fontWeight: 400, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>{category}</span>
            <h3 style={{ fontFamily: ff, fontWeight: 400, fontSize: 'clamp(20px,2vw,26px)', lineHeight: 1.18, color: 'var(--cream)', margin: '0 0 14px' }}>{title}</h3>
            <p style={{ fontFamily: ffs, fontWeight: 300, fontSize: 'clamp(12.5px,1.05vw,14px)', lineHeight: 1.8, color: 'var(--cr70)', margin: 0 }}>{body}</p>
            {reference && (
              <p style={{ fontFamily: ff, fontStyle: 'italic', fontSize: 'clamp(11.5px,1vw,13px)', lineHeight: 1.7, color: 'var(--cr40)', margin: 'clamp(14px,1.6vw,18px) 0 0' }}>{reference}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

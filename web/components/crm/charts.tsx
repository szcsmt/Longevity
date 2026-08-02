'use client';

/* Self-contained, dependency-free SVG charts for the CRM Analytics tab.
   Themed to the dark/gold design system. Every chart ships a hover layer.
   Magnitude → one gold hue; status/score → labelled semantic colours. */

import { useId, useRef, useState, type ReactNode } from 'react';
import { fmtInt } from '@/lib/crm/format';

const GOLD = '#C9A96E';
const GOLD_HI = '#E8C98A';

const isoShort = (iso: string) => {
  const p = iso.split('-');
  return p.length === 3 ? `${p[1]}.${p[2]}` : iso;
};

// ── shared tooltip ──
function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const move = (e: { clientX: number; clientY: number }, body: ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body });
  };
  const leave = () => setTip(null);
  const node = tip ? (
    <div className="cx-tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>
  ) : null;
  return { ref, move, leave, node };
}

function Empty({ label = 'Nincs adat ebben az időszakban' }: { label?: string }) {
  return <div className="cx-empty">{label}</div>;
}

// ── Area (time series) ──
export function AreaChart({ data, height = 168, unit = '' }: { data: { date: string; count: number }[]; height?: number; unit?: string }) {
  const gid = useId().replace(/:/g, '');
  const { ref, move, leave, node } = useTip();
  const [hi, setHi] = useState<number | null>(null);
  const W = 640, H = height, pL = 6, pR = 6, pT = 14, pB = 22;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.count));
  const x = (i: number) => (n <= 1 ? W / 2 : pL + (i / (n - 1)) * (W - pL - pR));
  const y = (v: number) => H - pB - (v / max) * (H - pT - pB);
  const base = H - pB;

  if (!data.some((d) => d.count > 0)) {
    return (
      <div className="cx-wrap" style={{ height }}>
        <Empty />
      </div>
    );
  }

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${base} ${data.map((d, i) => `L${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ')} L${x(n - 1).toFixed(1)},${base} Z`;
  const ticks = Array.from(new Set([0, Math.floor((n - 1) / 4), Math.floor((n - 1) / 2), Math.floor((3 * (n - 1)) / 4), n - 1])).filter((i) => i >= 0 && i < n);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setHi(i);
    move(e, <><b>{fmtInt(data[i].count)}{unit ? ` ${unit}` : ''}</b><span>{isoShort(data[i].date)}</span></>);
  };

  return (
    <div className="cx-wrap" ref={ref} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
        onMouseMove={onMove} onMouseLeave={() => { setHi(null); leave(); }}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.34" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={pL} y1={base} x2={W - pR} y2={base} stroke="rgba(228,217,195,0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={pL} y1={y(max)} x2={W - pR} y2={y(max)} stroke="rgba(228,217,195,0.07)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#g${gid})`} />
        <path d={line} fill="none" stroke={GOLD_HI} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hi != null && (
          <>
            <line x1={x(hi)} y1={pT - 6} x2={x(hi)} y2={base} stroke="rgba(232,201,138,0.4)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hi)} cy={y(data[hi].count)} r="3.5" fill={GOLD_HI} stroke="#0e1712" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="cx-xaxis">
        {ticks.map((i) => (
          <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>{isoShort(data[i].date)}</span>
        ))}
      </div>
      <div className="cx-ymax">{fmtInt(max)}</div>
      {node}
    </div>
  );
}

// ── Horizontal magnitude bars ──
export function BarList({ data, unit = '' }: { data: { name: string; count: number }[]; unit?: string }) {
  const { ref, move, leave, node } = useTip();
  if (!data.length || !data.some((d) => d.count > 0)) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="cx-bars" ref={ref} onMouseLeave={leave}>
      {data.map((d) => {
        const pct = total ? Math.round((d.count / total) * 100) : 0;
        return (
          <div className="cx-bar-row" key={d.name}
            onMouseMove={(e) => move(e, <><b>{fmtInt(d.count)}{unit ? ` ${unit}` : ''}</b><span>{d.name} · {pct}%</span></>)}>
            <span className="cx-bar-lab" title={d.name}>{d.name}</span>
            <span className="cx-bar-track"><span className="cx-bar-fill" style={{ width: `${(d.count / max) * 100}%` }} /></span>
            <span className="cx-bar-val">{fmtInt(d.count)}<i>{pct}%</i></span>
          </div>
        );
      })}
      {node}
    </div>
  );
}

// ── Donut (status / score) ──
export function Donut({ segments, centerValue, centerLabel, unit = '' }: {
  segments: { label: string; value: number; color: string }[]; centerValue?: string; centerLabel?: string; unit?: string;
}) {
  const { ref, move, leave, node } = useTip();
  const [hi, setHi] = useState<string | null>(null);
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const R = 46, C = 2 * Math.PI * R, GAP = 2.5;
  let acc = 0;
  return (
    <div className="cx-donut" ref={ref} onMouseLeave={() => { setHi(null); leave(); }}>
      <div className="cx-donut-svg">
        <svg viewBox="0 0 120 120" width="100%" height="100%">
          <g transform="rotate(-90 60 60)">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(228,217,195,0.06)" strokeWidth="15" />
            {segments.filter((s) => s.value > 0).map((s) => {
              const frac = s.value / total;
              const dash = Math.max(0, frac * C - GAP);
              const el = (
                <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={s.color}
                  strokeWidth={hi === s.label ? 19 : 15} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc}
                  strokeLinecap="butt" style={{ transition: 'stroke-width .15s' }}
                  onMouseMove={(e) => { setHi(s.label); move(e, <><b>{fmtInt(s.value)}{unit ? ` ${unit}` : ''}</b><span>{s.label} · {Math.round(frac * 100)}%</span></>); }}
                />
              );
              acc += frac * C;
              return el;
            })}
          </g>
        </svg>
        <div className="cx-donut-center">
          <b>{centerValue ?? fmtInt(total)}</b>
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      </div>
      <div className="cx-legend">
        {segments.map((s) => (
          <div className="cx-legend-row" key={s.label}
            onMouseMove={(e) => { setHi(s.label); move(e, <><b>{fmtInt(s.value)}{unit ? ` ${unit}` : ''}</b><span>{s.label}</span></>); }}
            onMouseLeave={() => setHi(null)}>
            <i className="cx-dot" style={{ background: s.color }} />
            <span className="cx-legend-lab">{s.label}</span>
            <span className="cx-legend-val">{fmtInt(s.value)}<em>{total ? Math.round((s.value / total) * 100) : 0}%</em></span>
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}

// ── Funnel ──
export function Funnel({ steps }: { steps: { label: string; count: number }[] }) {
  const { ref, move, leave, node } = useTip();
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="cx-funnel" ref={ref} onMouseLeave={leave}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const conv = prev && prev > 0 && s.count <= prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <div className="cx-funnel-step" key={s.label}
            onMouseMove={(e) => move(e, <><b>{fmtInt(s.count)}</b><span>{s.label}{conv != null ? ` · ${conv}% az előzőből` : ''}</span></>)}>
            <div className="cx-funnel-head"><span>{s.label}</span><b>{fmtInt(s.count)}{conv != null && <i>{conv}%</i>}</b></div>
            <div className="cx-funnel-bar"><span style={{ width: `${(s.count / max) * 100}%` }} /></div>
          </div>
        );
      })}
      {node}
    </div>
  );
}

// ── Stacked composition bars (villa status by block) ──
export function StackedBarList({ rows, legend }: {
  rows: { label: string; parts: { name: string; value: number; color: string }[] }[];
  legend?: { name: string; color: string }[];
}) {
  const { ref, move, leave, node } = useTip();
  if (!rows.length) return <Empty />;
  return (
    <div className="cx-stack" ref={ref} onMouseLeave={leave}>
      {legend && (
        <div className="cx-stack-legend">
          {legend.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}
        </div>
      )}
      {rows.map((r) => {
        const tot = r.parts.reduce((s, p) => s + p.value, 0) || 1;
        return (
          <div className="cx-stack-row" key={r.label}>
            <span className="cx-stack-lab">{r.label}</span>
            <span className="cx-stack-track">
              {r.parts.filter((p) => p.value > 0).map((p) => (
                <span key={p.name} className="cx-stack-seg" style={{ width: `${(p.value / tot) * 100}%`, background: p.color }}
                  onMouseMove={(e) => move(e, <><b>{fmtInt(p.value)}</b><span>{r.label} · {p.name}</span></>)} />
              ))}
            </span>
          </div>
        );
      })}
      {node}
    </div>
  );
}

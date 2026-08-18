'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Construction, VillaRecord, VillaHistoryEntry, VillaStatus } from '@/lib/crm/types';
import { CONSTRUCTION, CONTRACT_STEPS, PHASES } from '@/lib/crm/types';
import { EXTRA_PRESETS, VILLAS, fmtTHB, nextPhase, paidTotal, phaseAmount } from '@/lib/crm/villas';
import { REPLY_FLAG_DAYS } from '@/lib/crm/rules';

type Status = VillaStatus;
interface Villa {
  id: string; block: string; n: number; x: number; y: number;
  type?: string; size?: string; area?: number; plotArea?: number;
}
export interface LeadOption { id: string; name: string; awaitingSince: string | null; villa?: string; stage?: string }

const ORDER: Status[] = ['free', 'reserved', 'sold'];
const COLORS: Record<Status, string> = { free: '#2FA968', reserved: '#E0A63A', sold: '#D8483B' };
const LABELS: Record<Status, string> = { free: 'Szabad', reserved: 'Foglalt', sold: 'Eladott' };

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', dateStyle: 'medium' }) : '—');
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export function Masterplan({
  image, villas, initial, history: initHistory, leads, readOnly = false,
}: {
  image: string; villas: Villa[]; initial: Record<string, VillaRecord>;
  history: VillaHistoryEntry[]; leads: LeadOption[]; readOnly?: boolean;
}) {
  const [records, setRecords] = useState<Record<string, VillaRecord>>(initial);
  const [history, setHistory] = useState<VillaHistoryEntry[]>(initHistory);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<{ status: Status; seller: string; note: string }>({ status: 'free', seller: '', note: '' });
  const [savingState, setSaving] = useState(false);
  const saving = savingState || readOnly; // readOnly locks every control
  const [contractDraft, setContractDraft] = useState('');
  const [editingValue, setEditingValue] = useState(false);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraPrice, setExtraPrice] = useState('');
  const [resAmount, setResAmount] = useState('');
  const [resExpiry, setResExpiry] = useState('');
  /* Calendar day, for reading a reservation's expiry. Computed once per render
     rather than per row. */
  const today = new Date().toISOString().slice(0, 10);
  /* Why a refusal has to be visible: the server now declines to reserve a unit
     somebody else already holds, and it says which buyer holds it. Swallowing
     that turns a deliberate safeguard into a button that appears broken. */
  const [err, setErr] = useState<string | null>(null);

  // The layout auto-refreshes every few seconds; adopt the fresh server
  // snapshot so the board always shows current data — except mid-save, when
  // our optimistic state is ahead of the incoming props.
  useEffect(() => {
    if (!saving) { setRecords(initial); setHistory(initHistory); }
  }, [initial, initHistory, saving]);

  const byId = useMemo(() => Object.fromEntries(villas.map((v) => [v.id, v])), [villas]);
  const leadById = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);

  // Active enquiries per unit: a lead whose villa field IS this unit's code
  // (the 3D twin sends e.g. "B5") and whose deal is still open.
  const enquiries = useMemo(() => {
    const m: Record<string, LeadOption[]> = {};
    for (const l of leads) {
      const unit = (l.villa || '').trim().toUpperCase();
      if (!unit || !['new', 'contacted', 'qualified'].includes(l.stage || '')) continue;
      if (byId[unit]) (m[unit] ??= []).push(l);
    }
    return m;
  }, [leads, byId]);
  const statusOf = (id: string): Status => records[id]?.status || 'free';

  const counts = useMemo(() => {
    const c = { free: 0, reserved: 0, sold: 0 };
    villas.forEach((v) => { c[statusOf(v.id)] += 1; });
    return c;
  }, [records, villas]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Linked lead is silent past the threshold → the plot needs a chase. */
  const waiting = (rec?: VillaRecord): number => {
    const since = rec?.buyerLeadId ? leadById[rec.buyerLeadId]?.awaitingSince : null;
    return since ? daysSince(since) : -1;
  };

  function open(id: string) {
    const r = records[id];
    setForm({ status: r?.status || 'free', seller: r?.seller || '', note: r?.note || '' });
    setContractDraft(r?.contractValue ? String(r.contractValue) : '');
    setEditingValue(false);
    setExtraLabel(''); setExtraPrice('');
    setResAmount(''); setResExpiry('');
    setSel(id);
    setErr(null);
  }

  async function api(body: Record<string, unknown>) {
    if (readOnly) { setErr('Csak megtekintésre jogosult fiók, a módosítás le van tiltva.'); return false; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/crm/villas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (data?.villas) { setRecords(data.villas); setHistory(data.history || []); }
      if (!data?.ok) {
        setErr(data?.error || 'A mentés nem sikerült. Próbáld újra.');
        return false;
      }
      return true;
    } catch {
      // A dropped connection must not read as a saved change.
      setErr('Nem sikerült elérni a szervert. A módosítás nem mentődött el.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus() {
    if (!sel) return;
    if (form.status !== 'free' && !form.seller.trim()) return; // seller required for reserved/sold
    await api({ id: sel, status: form.status, seller: form.seller, note: form.note });
  }

  const sale = (patch: Record<string, unknown>) => sel && api({ id: sel, op: 'sale', patch });

  const villa = sel ? byId[sel] : null;
  const rec = sel ? records[sel] : undefined;
  const villaHistory = sel ? history.filter((h) => h.villaId === sel) : [];
  const specs = villa ? [
    villa.type === '2BR' ? '2 hálószoba' : villa.type === '1BR' ? '1 hálószoba' : null,
    villa.size ? `${villa.size} típus` : null,
    villa.area ? `${villa.area} m²` : null,
  ].filter(Boolean).join(' · ') : '';
  const paid = rec ? paidTotal(rec) : 0;
  const next = rec ? nextPhase(rec) : null;
  const waitDays = waiting(rec);

  return (
    <div>
      <style>{`
        .mp-legend { display: flex; flex-wrap: wrap; gap: 22px; align-items: center; margin-bottom: 18px; }
        .mp-leg { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; color: var(--c-cream); }
        .mp-swatch { width: 13px; height: 13px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.25) inset; }
        .mp-count { font-variant-numeric: tabular-nums; color: var(--c-mut); margin-left: 4px; }
        .mp-hint { margin-left: auto; font-size: 12px; color: var(--c-mut-2); }
        @media (max-width: 720px) {
          .mp-dot { min-width: 24px; min-height: 24px; }
          .mp-hint { flex: 1 1 100%; margin-left: 0; }
        }

        .mp-scroll { overflow-x: auto; border: 1px solid var(--c-line); border-radius: 14px; background: #f4f4ef; }
        .mp-wrap { container-type: inline-size; position: relative; min-width: 780px; max-width: 1280px; margin: 0 auto; }
        .mp-wrap img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; }

        .mp-dot {
          position: absolute; transform: translate(-50%,-50%); cursor: pointer;
          width: 2.7cqw; height: 2.7cqw; min-width: 19px; min-height: 19px; border-radius: 50%;
          display: grid; place-items: center; padding: 0; border: 1.5px solid rgba(255,255,255,0.9);
          font-family: var(--ui); font-weight: 700; color: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4); transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .mp-dot > span { font-size: max(9px, 1.35cqw); }
        .mp-dot:hover { transform: translate(-50%,-50%) scale(1.3); box-shadow: 0 3px 10px rgba(0,0,0,0.5); z-index: 5; }
        .mp-dot.on { outline: 2px solid #0b140d; outline-offset: 2px; z-index: 6; }
        .mp-dot.wait::after { content: ''; position: absolute; top: -3px; right: -3px; width: 9px; height: 9px;
          border-radius: 50%; background: #E0774E; border: 1.5px solid #fff; }
        .mp-dot.enq::before { content: ''; position: absolute; bottom: -3px; right: -3px; width: 9px; height: 9px;
          border-radius: 50%; background: #C9A46A; border: 1.5px solid #fff; }
        .mp-dot:hover .mp-tip { opacity: 1; transform: translate(-50%, -6px); }
        .mp-tip { position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, 2px);
          background: #0b140d; color: #fff; border: 1px solid rgba(201,169,110,0.4);
          font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 6px;
          white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease; }

        /* Drawer */
        .mp-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(4,8,5,0.55); backdrop-filter: blur(2px); }
        .mp-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: min(460px, 94vw);
          background: var(--c-panel); border-left: 1px solid var(--c-line); box-shadow: -30px 0 80px -30px rgba(0,0,0,0.8);
          display: flex; flex-direction: column; animation: mpSlide 0.32s cubic-bezier(0.16,1,0.3,1); }
        @keyframes mpSlide { from { transform: translateX(30px); opacity: 0.4; } to { transform: none; opacity: 1; } }
        .mp-dhead { padding: 22px 24px 18px; border-bottom: 1px solid var(--c-line); }
        .mp-dbody { padding: 20px 24px; overflow-y: auto; flex: 1; }
        .mp-x { position: absolute; top: 16px; right: 18px; background: none; border: none; color: var(--c-mut); font-size: 22px; cursor: pointer; line-height: 1; }
        .mp-x:hover { color: var(--c-cream); }
        .mp-stbtns { display: flex; gap: 8px; margin: 4px 0 18px; }
        .mp-st { flex: 1; cursor: pointer; padding: 11px 6px; border-radius: 10px; border: 1px solid var(--c-line);
          background: transparent; color: var(--c-mut); font-family: var(--ui); font-size: 13px; font-weight: 600; transition: all 0.18s ease; }
        .mp-st:hover { color: var(--c-cream); }
        .mp-st.on { color: #fff; }
        .mp-timeline { list-style: none; margin: 0; padding: 0; }
        .mp-timeline li { padding: 11px 0; border-bottom: 1px solid var(--c-line-2); font-size: 13px; }
        .mp-timeline li:last-child { border: 0; }
        .mp-timeline .t { color: var(--c-mut-2); font-size: 11px; margin-top: 3px; }

        /* Sale panel */
        .mp-sec { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--c-line-2); }
        .mp-sec h3 { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--c-mut); margin: 0 0 14px; font-weight: 600; }
        .mp-phase { display: flex; align-items: center; gap: 11px; padding: 10px 0; border-bottom: 1px solid var(--c-line-2); font-size: 13.5px; }
        .mp-phase:last-child { border-bottom: 0; }
        .mp-phase input[type=checkbox] { width: 17px; height: 17px; accent-color: var(--c-gold); flex-shrink: 0; }
        .mp-phase .amt { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--c-cream); white-space: nowrap; }
        .mp-phase .gate { color: var(--c-mut-2); font-size: 11px; margin-top: 1px; }
        .mp-phase.paid .gate { color: var(--c-mut); }
        .mp-paidbar { height: 8px; border-radius: 100px; background: rgba(228,217,195,0.07); overflow: hidden; margin: 12px 0 6px; }
        .mp-paidbar > span { display: block; height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--c-gold), var(--c-gold-bright)); }
        .mp-wait { display: inline-flex; align-items: center; gap: 7px; margin-top: 10px; padding: 5px 11px; border-radius: 100px;
          font-size: 12px; font-weight: 600; color: #E0774E; background: rgba(224,119,78,0.12); border: 1px solid rgba(224,119,78,0.3); }
        .mp-extra { display: flex; align-items: center; gap: 9px; padding: 8px 0; border-bottom: 1px solid var(--c-line-2); font-size: 13.5px; }
        .mp-extra:last-child { border-bottom: 0; }
        .mp-extra .px { margin-left: auto; color: var(--c-mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mp-extra button { background: none; border: none; color: var(--c-mut-2); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px; }
        .mp-extra button:hover { color: var(--c-hot); }
        .mp-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .mp-cv { display: flex; align-items: center; gap: 8px; min-height: 41px; padding: 9px 13px;
          border: 1px dashed var(--c-line); border-radius: 9px; cursor: pointer; font-size: 14px; color: var(--c-cream); }
        .mp-cv:hover { border-color: var(--c-gold); }
        .mp-cv-hint { color: var(--c-mut-2); font-size: 11px; }
        .mp-cv-edit { margin-left: auto; background: none; border: none; color: var(--c-mut); cursor: pointer; font-size: 14px; padding: 2px; }
        .mp-cv-edit:hover { color: var(--c-gold); }
        @media (max-width: 460px) {
          .mp-2col { grid-template-columns: 1fr; }
          .mp-drawer { width: 100vw; }
          .mp-dbody { padding: 16px 16px 28px; }
          .mp-dhead { padding: 18px 16px 14px; }
        }
      `}</style>

      {/* Legend + counts */}
      <div className="mp-legend">
        {ORDER.map((s) => (
          <span className="mp-leg" key={s}>
            <span className="mp-swatch" style={{ background: COLORS[s] }} />
            {LABELS[s]}<span className="mp-count">{counts[s]}</span>
          </span>
        ))}
        <span className="mp-hint">Kattints egy villára a részletekért, fizetési fázisokért és a státuszért</span>
      </div>

      {/* Plan + hotspots */}
      <div className="mp-scroll">
        <div className="mp-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Longevity Resort masterplan" draggable={false} />
          {villas.map((v) => {
            const st = statusOf(v.id);
            const r = records[v.id];
            const w = waiting(r) >= REPLY_FLAG_DAYS;
            const enq = enquiries[v.id]?.length || 0;
            const tipBits = [
              `${v.id} · ${LABELS[st]}`,
              r?.buyerName ? r.buyerName : null,
              r && paidTotal(r) > 0 ? `${fmtTHB(paidTotal(r))} fizetve` : null,
              enq ? `${enq} érdeklődő` : null,
              w ? 'válaszra vár!' : null,
            ].filter(Boolean);
            return (
              <button
                key={v.id}
                type="button"
                className={`mp-dot${sel === v.id ? ' on' : ''}${w ? ' wait' : ''}${enq ? ' enq' : ''}`}
                onClick={() => open(v.id)}
                aria-label={`${v.id} — ${LABELS[st]}`}
                style={{ left: `${v.x}%`, top: `${v.y}%`, background: COLORS[st] }}
              >
                <span>{v.n}</span>
                <span className="mp-tip">{tipBits.join(' · ')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail drawer */}
      {villa && (
        <>
          <div className="mp-scrim" onClick={() => setSel(null)} />
          <aside className="mp-drawer" role="dialog" aria-label={`Villa ${villa.id}`}>
            <div className="mp-dhead" style={{ position: 'relative' }}>
              <button className="mp-x" onClick={() => setSel(null)} aria-label="Bezárás">×</button>
              <div className="crm-meta" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 11 }}>Tömb {villa.block}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 32, lineHeight: 1, margin: '4px 0 6px' }}>Villa {villa.id}</div>
              <div className="crm-meta">{specs || 'Adatok hamarosan'}</div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="badge" style={{ color: COLORS[statusOf(villa.id)], background: 'transparent', border: `1px solid ${COLORS[statusOf(villa.id)]}55` }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS[statusOf(villa.id)], display: 'inline-block' }} />
                  {LABELS[statusOf(villa.id)]}
                </span>
                {rec?.buyerName && <span className="crm-meta">{rec.buyerName}</span>}
                {paid > 0 && <span className="crm-meta tabnum">{fmtTHB(paid)} fizetve</span>}
              </div>
              {waitDays >= REPLY_FLAG_DAYS && (
                <span className="mp-wait">⚠ Válaszra várunk {waitDays} napja</span>
              )}
            </div>

            <div className="mp-dbody">
              <label className="crm-label">Státusz</label>
              <div className="mp-stbtns">
                {ORDER.map((s) => (
                  <button key={s} type="button"
                    className={`mp-st${form.status === s ? ' on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, status: s }))}
                    style={form.status === s ? { background: COLORS[s], borderColor: COLORS[s] } : undefined}>
                    {LABELS[s]}
                  </button>
                ))}
              </div>

              {form.status !== 'free' && (
                <div style={{ marginBottom: 14 }}>
                  <label className="crm-label">Ki adta el / foglalta le? <span style={{ color: 'var(--c-hot)' }}>*</span></label>
                  <input className="crm-input" value={form.seller} placeholder="Pl. Longevity Sales"
                    onChange={(e) => setForm((f) => ({ ...f, seller: e.target.value }))} />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label className="crm-label">Megjegyzés (opcionális)</label>
                <textarea className="crm-textarea" rows={2} value={form.note} placeholder="Pl. vevő neve, foglalási dátum…"
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
              </div>

              <button className="crm-btn gold" onClick={saveStatus}
                disabled={saving || (form.status !== 'free' && !form.seller.trim())}
                style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Mentés…' : 'Státusz mentése'}
              </button>
              {err && (
                <div className="crm-meta" style={{ marginTop: 8, color: 'var(--c-hot)', lineHeight: 1.5 }}>
                  {err}
                </div>
              )}
              {form.status !== 'free' && !form.seller.trim() && (
                <div className="crm-meta" style={{ marginTop: 8, color: 'var(--c-hot)' }}>Add meg, ki adta el / foglalta le.</div>
              )}

              {/* ── Vevő és szerződés ── */}
              <div className="mp-sec">
                <h3>Vevő és szerződés</h3>
                <label className="crm-label">Vevő (CRM lead)</label>
                <select className="crm-select" value={rec?.buyerLeadId || ''} disabled={saving}
                  onChange={(e) => sale({ buyerLeadId: e.target.value || null })}
                  style={{ marginBottom: 12 }}>
                  <option value="">— nincs hozzárendelve —</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {rec?.buyerLeadId && (
                  <div style={{ margin: '-6px 0 12px' }}>
                    <Link className="crm-meta" href={`/admin/leads/${rec.buyerLeadId}`} style={{ color: 'var(--c-gold)' }}>
                      → Lead megnyitása
                    </Link>
                  </div>
                )}
                <div className="mp-2col" style={{ marginBottom: 4 }}>
                  <div>
                    <label className="crm-label">Szerződéses érték (THB)</label>
                    {editingValue ? (
                      <input className="crm-input" inputMode="numeric" placeholder="pl. 8050000"
                        value={contractDraft} disabled={saving} autoFocus
                        onChange={(e) => setContractDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') { setContractDraft(rec?.contractValue ? String(rec.contractValue) : ''); setEditingValue(false); }
                        }}
                        onBlur={() => {
                          setEditingValue(false);
                          const raw = contractDraft.replace(/[^\d]/g, '');
                          const n = raw ? parseInt(raw, 10) : null;
                          if ((n || undefined) !== rec?.contractValue) sale({ contractValue: n });
                        }} />
                    ) : (() => {
                      const listPrice = villa.size ? VILLAS.find((x) => x.name === `Residence ${villa.size}`)?.price : undefined;
                      const startEdit = () => {
                        setContractDraft(String(rec?.contractValue ?? listPrice ?? ''));
                        setEditingValue(true);
                      };
                      return (
                        <div className="mp-cv" onDoubleClick={startEdit} title="Dupla kattintás a módosításhoz">
                          <span className="tabnum">
                            {rec?.contractValue
                              ? fmtTHB(rec.contractValue)
                              : listPrice
                                ? <>{fmtTHB(listPrice)} <span className="mp-cv-hint">lista-ár, eladáskor magától rögzül</span></>
                                : '— (nincs lista-ár, írd be kézzel)'}
                          </span>
                          <button type="button" className="mp-cv-edit" aria-label="Szerződéses érték módosítása" onClick={startEdit}>✎</button>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="crm-label">Ígért átadás</label>
                    <input className="crm-input" type="date" aria-label="Ígért átadási dátum"
                      value={rec?.promisedDate || ''} disabled={saving}
                      onChange={(e) => sale({ promisedDate: e.target.value || null })} />
                  </div>
                </div>
                <label className="crm-label" style={{ marginTop: 10 }}>Építkezés állása</label>
                <select className="crm-select" value={rec?.construction || 'not_started'} disabled={saving}
                  onChange={(e) => sale({ construction: e.target.value as Construction })}>
                  {CONSTRUCTION.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              {/* ── Foglalás ──

                  Eddig a „foglalt" státusz annyit mondott, hogy a villa tartva
                  van. Azt nem, hogy meddig, mekkora előlegre, és hogy az előleg
                  megérkezett-e — pedig a foglalási szerződés pontosan ebből a
                  négy adatból áll. Enélkül a lejárt foglalás pontosan úgy nézett
                  ki, mint az élő. */}
              <div className="mp-sec">
                <h3>Foglalás</h3>
                {rec?.reservation ? (
                  <>
                    <div className="crm-meta" style={{ marginBottom: 10 }}>
                      Foglalva {fmtDay(rec.reservation.at)}{rec.reservation.by ? ` · ${rec.reservation.by}` : ''}
                    </div>
                    <div className="edit-grid">
                      <div>
                        <label className="crm-label">Előleg (THB)</label>
                        <input className="crm-input" inputMode="numeric" defaultValue={rec.reservation.amount || ''}
                          disabled={saving}
                          onBlur={(e) => sel && api({ id: sel, op: 'reservationPatch', patch: { amount: Number(e.target.value) || null } })} />
                      </div>
                      <div>
                        <label className="crm-label">Előleg beérkezett</label>
                        <input className="crm-input" type="date" defaultValue={rec.reservation.paid_at || ''}
                          disabled={saving}
                          onChange={(e) => sel && api({ id: sel, op: 'reservationPatch', patch: { paidAt: e.target.value || null } })} />
                      </div>
                      <div>
                        <label className="crm-label">Meddig tartjuk</label>
                        <input className="crm-input" type="date" defaultValue={rec.reservation.expires_at || ''}
                          disabled={saving}
                          onChange={(e) => sel && api({ id: sel, op: 'reservationPatch', patch: { expiresAt: e.target.value || null } })} />
                      </div>
                      <div>
                        <label className="crm-label">Foglalási szerződés</label>
                        <input className="crm-input" placeholder="fájlnév vagy link" defaultValue={rec.reservation.agreement || ''}
                          disabled={saving}
                          onBlur={(e) => sel && api({ id: sel, op: 'reservationPatch', patch: { agreement: e.target.value || null } })} />
                      </div>
                    </div>
                    {rec.reservation.expires_at && (
                      <div className="crm-meta" style={{ marginTop: 8, color: rec.reservation.expires_at < today ? 'var(--c-hot)' : undefined }}>
                        {rec.reservation.expires_at < today
                          ? '⚠ A foglalás lejárt — vagy hosszabbítsd meg, vagy engedd el.'
                          : `A foglalás ${rec.reservation.expires_at}-ig él.`}
                      </div>
                    )}
                    {!readOnly && (
                      <button className="crm-btn danger sm" style={{ marginTop: 12 }} disabled={saving}
                        onClick={async () => {
                          const why = window.prompt('Miért engedjük el a foglalást?\n\nA villa visszakerül a piacra; az indoklás bekerül az előzményekbe.');
                          if (why && why.trim() && sel) await api({ id: sel, op: 'releaseReservation', reason: why });
                        }}>
                        Foglalás elengedése
                      </button>
                    )}
                  </>
                ) : !readOnly ? (
                  <>
                    <div className="crm-meta" style={{ marginBottom: 10 }}>
                      {rec?.buyerLeadId || rec?.buyerName
                        ? 'Rögzítsd a foglalást a mögötte álló megállapodással együtt, ne csak a státuszt.'
                        : 'Előbb kösd hozzá a vevőt — egy foglalás, aminek nincs neve, nem foglalás.'}
                    </div>
                    <div className="edit-grid">
                      <div>
                        <label className="crm-label">Előleg (THB)</label>
                        <input className="crm-input" inputMode="numeric" value={resAmount}
                          disabled={saving} onChange={(e) => setResAmount(e.target.value)} />
                      </div>
                      <div>
                        <label className="crm-label">Meddig tartjuk</label>
                        <input className="crm-input" type="date" value={resExpiry}
                          disabled={saving} onChange={(e) => setResExpiry(e.target.value)} />
                      </div>
                    </div>
                    <button className="crm-btn gold sm" style={{ marginTop: 12 }}
                      disabled={saving || !(rec?.buyerLeadId || rec?.buyerName)}
                      onClick={async () => {
                        if (!sel) return;
                        const ok = await api({
                          id: sel, op: 'reserve',
                          amount: Number(resAmount) || undefined,
                          expiresAt: resExpiry || undefined,
                        });
                        if (ok) { setResAmount(''); setResExpiry(''); }
                      }}>
                      Foglalás rögzítése
                    </button>
                  </>
                ) : (
                  <div className="crm-meta">Nincs foglalás ezen a villán.</div>
                )}
              </div>

              {/* ── Adásvételi (SPA) ──
                  A foglalás és az eladás között eddig semmi nem volt: egy üzlet
                  három hónapig „foglalt" volt akkor is, ha a szerződés aznap
                  reggel ment ki, és akkor is, ha alá volt írva egy fiókban. */}
              <div className="mp-sec">
                <h3>Adásvételi szerződés</h3>
                <select className="crm-select" value={rec?.contract?.status || 'none'} disabled={saving || readOnly}
                  onChange={(e) => sel && api({ id: sel, op: 'contract', status: e.target.value })}>
                  {CONTRACT_STEPS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {rec?.contract && (
                  <div className="crm-meta" style={{ marginTop: 8 }}>
                    {[
                      rec.contract.sent_at && `kiküldve ${rec.contract.sent_at}`,
                      rec.contract.reviewed_at && `véleményezve ${rec.contract.reviewed_at}`,
                      rec.contract.signed_at && `aláírva ${rec.contract.signed_at}`,
                    ].filter(Boolean).join(' · ') || 'Még nincs dátum rögzítve.'}
                  </div>
                )}
              </div>

              {/* ── Fizetési fázisok ── */}
              <div className="mp-sec">
                <h3>Fizetési ütem — 7 / 43 / 40 / 10</h3>
                {!rec?.contractValue && (
                  <div className="crm-meta" style={{ marginBottom: 10 }}>
                    Add meg a szerződéses értéket, és az összegek maguktól számolódnak.
                  </div>
                )}
                {PHASES.map((p) => {
                  const ph = rec?.phases?.[p.key];
                  const amt = rec ? phaseAmount(rec, p.key) : 0;
                  return (
                    <div className={`mp-phase${ph?.paid ? ' paid' : ''}`} key={p.key}>
                      <input type="checkbox" checked={ph?.paid || false} disabled={saving}
                        aria-label={p.label}
                        onChange={(e) => sel && api({ id: sel, op: 'phase', key: p.key, paid: e.target.checked })} />
                      <div>
                        <div>{p.label}</div>
                        <div className="gate">{p.gate}{ph?.paid && ph.at ? ` · fizetve ${fmtDay(ph.at)}` : ''}</div>
                      </div>
                      {amt > 0 && <span className="amt">{fmtTHB(amt)}</span>}
                    </div>
                  );
                })}
                {rec?.contractValue ? (
                  <>
                    <div className="mp-paidbar">
                      <span style={{ width: `${Math.min(100, Math.round((paid / rec.contractValue) * 100))}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span className="crm-meta">Befizetve: <b style={{ color: 'var(--c-cream)' }}>{fmtTHB(paid)}</b></span>
                      <span className="crm-meta">Hátra: {fmtTHB(Math.max(0, rec.contractValue - paid))}</span>
                    </div>
                    {next && (
                      <div className="crm-meta" style={{ marginTop: 6 }}>
                        Következő: {next.label} — {fmtTHB(phaseAmount(rec, next.key))} ({next.gate})
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* ── Érdeklődők ── */}
              {(enquiries[villa.id]?.length || 0) > 0 && (
                <div className="mp-sec">
                  <h3>Érdeklődők erre a telekre · {enquiries[villa.id].length}</h3>
                  {enquiries[villa.id].map((l) => (
                    <div className="mp-extra" key={l.id}>
                      <Link href={`/admin/leads/${l.id}`} style={{ color: 'var(--c-cream)', textDecoration: 'none' }}>
                        {l.name}
                      </Link>
                      <span className="px" style={{ textTransform: 'capitalize' }}>{l.stage}</span>
                    </div>
                  ))}
                  <div className="crm-meta" style={{ marginTop: 8, fontSize: 11.5 }}>
                    Ha vevő lesz, a fenti „Vevő (CRM lead)" választóval kösd a telekhez.
                  </div>
                </div>
              )}

              {/* ── Extrák ── */}
              <div className="mp-sec">
                <h3>Extra kérések</h3>
                {(rec?.extras || []).length === 0 && (
                  <div className="crm-meta" style={{ marginBottom: 8 }}>Nincs extra kérés rögzítve.</div>
                )}
                {(rec?.extras || []).map((x) => (
                  <div className="mp-extra" key={x.id}>
                    <span>{x.label}</span>
                    {x.price ? <span className="px">{fmtTHB(x.price)}</span> : <span className="px" />}
                    <button type="button" aria-label={`${x.label} törlése`} disabled={saving}
                      onClick={() => sel && api({ id: sel, op: 'extraRemove', extraId: x.id })}>×</button>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <input className="crm-input" list="mp-extra-presets" placeholder="Pl. Podcast studio…"
                    value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} style={{ marginBottom: 8 }} />
                  <datalist id="mp-extra-presets">
                    {EXTRA_PRESETS.map((p) => <option key={p} value={p} />)}
                  </datalist>
                  <div className="mp-2col">
                    <input className="crm-input" inputMode="numeric" placeholder="Ár (THB, opcionális)"
                      value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} />
                    <button className="crm-btn sm" disabled={saving || !extraLabel.trim()}
                      style={{ justifyContent: 'center' }}
                      onClick={async () => {
                        const raw = extraPrice.replace(/[^\d]/g, '');
                        if (await api({ id: sel, op: 'extraAdd', label: extraLabel, price: raw ? parseInt(raw, 10) : undefined })) {
                          setExtraLabel(''); setExtraPrice('');
    setResAmount(''); setResExpiry('');
                        }
                      }}>
                      + Hozzáadás
                    </button>
                  </div>
                </div>
              </div>

              {/* History */}
              <div className="mp-sec">
                <h3>Előzmények</h3>
                {villaHistory.length === 0 ? (
                  <div className="empty" style={{ textAlign: 'left', padding: '10px 0' }}>Még nincs módosítás.</div>
                ) : (
                  <ul className="mp-timeline">
                    {villaHistory.map((h) => (
                      <li key={h.id}>
                        {h.from !== h.to ? (
                          <>
                            <span style={{ color: COLORS[h.from] }}>{LABELS[h.from]}</span>
                            {' → '}
                            <span style={{ color: COLORS[h.to], fontWeight: 600 }}>{LABELS[h.to]}</span>
                            {h.seller ? <span className="crm-meta"> · {h.seller}</span> : null}
                            {h.note ? <div className="crm-meta" style={{ marginTop: 2 }}>{h.note}</div> : null}
                          </>
                        ) : (
                          <span>{h.note || '—'}</span>
                        )}
                        <div className="t">{fmt(h.at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

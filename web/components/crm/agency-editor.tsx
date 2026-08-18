'use client';

/* The agency's own page: the terms, the people, and the way out.

   Everything here is an owner's decision — a commission percentage and a
   protection window are what the CRM will later use to work out who is owed
   what — so the whole component is only rendered for an admin. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Agency } from '@/lib/crm/types';
import { AGENCY_STATUS, COMMISSION_MODELS } from '@/lib/crm/types';
import { fmtTHB } from '@/lib/crm/villas';
import { PortalAccess } from '@/components/crm/portal-access';

const num = (v?: number) => (v === undefined || v === null ? '' : String(v));

export function AgencyEditor({
  agency: initial, houseDays, generated,
}: {
  agency: Agency;
  houseDays: number;
  /** What the agreement generates on the won volume — computed server-side
      from the leads, which this component has no business loading. */
  generated?: number;
}) {
  const router = useRouter();
  const [agency, setAgency] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', whatsapp: '' });
  const [payment, setPayment] = useState({ amount: '', at: '', reference: '', against: '' });

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/agencies/${agency.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || 'That change could not be saved.'); return; }
      if (data.agency) setAgency(data.agency);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /* Every field saves on blur. An agency page is read far more often than it
     is edited, and a Save button that somebody forgets to press is a
     commission percentage that silently stayed wrong. */
  const patch = (key: string) => (value: string) => {
    const raw = value.trim();
    const numeric = ['commission_pct', 'commission_fixed', 'protection_days'].includes(key);
    send({ op: 'update', patch: { [key]: numeric ? (raw === '' ? 0 : Number(raw)) : raw } });
  };

  const model = agency.commission_model;
  const paid = (agency.payments || []).reduce((n, p) => n + p.amount, 0);

  return (
    <div className="crm-detail">
      <div className="stack">
        <div className="crm-card">
          <h3>The agreement</h3>
          <div className="edit-grid">
            <label>
              <span className="crm-label">Name</span>
              <input className="crm-input" defaultValue={agency.name} disabled={busy}
                onBlur={(e) => e.target.value.trim() && e.target.value !== agency.name && patch('name')(e.target.value)} />
            </label>
            <label>
              <span className="crm-label">Country</span>
              <input className="crm-input" defaultValue={agency.country || ''} disabled={busy}
                onBlur={(e) => patch('country')(e.target.value)} />
            </label>
            <label>
              <span className="crm-label">Website</span>
              <input className="crm-input" defaultValue={agency.website || ''} disabled={busy}
                onBlur={(e) => patch('website')(e.target.value)} />
            </label>
            <label>
              <span className="crm-label">Where we stand</span>
              <select className="crm-select" value={agency.status} disabled={busy}
                onChange={(e) => send({ op: 'update', patch: { status: e.target.value } })}>
                {AGENCY_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>
              <span className="crm-label">Agreement signed</span>
              <input className="crm-input" type="date" defaultValue={agency.agreement_at || ''} disabled={busy}
                onBlur={(e) => patch('agreement_at')(e.target.value)} />
            </label>
            <label>
              <span className="crm-label">Commission model</span>
              <select className="crm-select" value={model || ''} disabled={busy}
                onChange={(e) => send({ op: 'update', patch: { commission_model: e.target.value } })}>
                <option value="">Nothing agreed yet</option>
                {COMMISSION_MODELS.filter((m) => m.id !== 'none').map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            {model === 'percent' && (
              <label>
                <span className="crm-label">Commission %</span>
                <input className="crm-input" inputMode="decimal" defaultValue={num(agency.commission_pct)} disabled={busy}
                  onBlur={(e) => patch('commission_pct')(e.target.value)} />
              </label>
            )}
            {model === 'fixed' && (
              <label>
                <span className="crm-label">Fee per sale (THB)</span>
                <input className="crm-input" inputMode="numeric" defaultValue={num(agency.commission_fixed)} disabled={busy}
                  onBlur={(e) => patch('commission_fixed')(e.target.value)} />
              </label>
            )}
            <label>
              <span className="crm-label">Protection window (days)</span>
              <input className="crm-input" inputMode="numeric" placeholder={`${houseDays} — the house default`}
                defaultValue={num(agency.protection_days)} disabled={busy}
                onBlur={(e) => patch('protection_days')(e.target.value)} />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="crm-label">Notes</span>
            <textarea className="crm-textarea" defaultValue={agency.note || ''} disabled={busy}
              onBlur={(e) => patch('note')(e.target.value)} />
          </label>
          <div className="crm-meta" style={{ marginTop: 10 }}>
            Every field saves when you leave it.
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="crm-card">
          <h3>Their agents</h3>
          {agency.contacts.length === 0 && (
            <div className="crm-meta" style={{ marginBottom: 12 }}>
              Nobody named yet. A registration works without one, but crediting a person is what makes
              &ldquo;which of their agents actually sells&rdquo; answerable.
            </div>
          )}
          {agency.contacts.map((c) => (
            <div key={c.id} className="related-row">
              <div style={{ minWidth: 0 }}>
                <div className="crm-name" style={{ opacity: c.inactive ? 0.5 : 1 }}>
                  {c.name}{c.inactive ? ' · no longer there' : ''}
                </div>
                <div className="crm-meta">{[c.email, c.phone, c.whatsapp].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <button className="crm-btn ghost sm" disabled={busy}
                onClick={() => send({ op: 'setContactActive', contactId: c.id, active: Boolean(c.inactive) })}>
                {c.inactive ? 'Bring back' : 'They left'}
              </button>
            </div>
          ))}

          <div style={{ marginTop: 14 }}>
            <label className="crm-label">Add someone</label>
            {(['name', 'email', 'phone', 'whatsapp'] as const).map((k) => (
              <input
                key={k}
                className="crm-input"
                style={{ marginBottom: 8 }}
                placeholder={k[0].toUpperCase() + k.slice(1)}
                value={contact[k]}
                disabled={busy}
                onChange={(e) => setContact((c) => ({ ...c, [k]: e.target.value }))}
              />
            ))}
            <button
              className="crm-btn sm"
              disabled={busy || !contact.name.trim()}
              onClick={async () => {
                await send({ op: 'addContact', contact });
                setContact({ name: '', email: '', phone: '', whatsapp: '' });
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* ── The commission ledger ──

            What the agreement GENERATES is a calculation. What has been paid is
            a fact, and guessing at it would be worse than leaving it blank. So
            it is recorded one payment at a time, append-only: a mistake is
            corrected with a negative entry rather than removed, because a money
            record that can quietly disappear is not a record. */}
        <div className="crm-card">
          <h3>Commission</h3>
          <dl className="kv">
            <dt>Generated</dt>
            <dd>{generated === undefined ? '— no agreement yet' : fmtTHB(generated)}</dd>
            <dt>Paid</dt>
            <dd>{fmtTHB(paid)}</dd>
            <dt>Outstanding</dt>
            <dd style={{ color: generated !== undefined && generated - paid > 0 ? 'var(--c-gold-bright)' : undefined }}>
              {generated === undefined ? '—' : fmtTHB(generated - paid)}
            </dd>
          </dl>

          {(agency.payments || []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              {(agency.payments || []).map((p) => (
                <div key={p.id} className="related-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="crm-name" style={{ color: p.amount < 0 ? 'var(--c-hot)' : undefined }}>
                      {fmtTHB(p.amount)}
                    </div>
                    <div className="crm-meta">
                      {p.at}
                      {p.against ? ` · ${p.against}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.by ? ` · ${p.by}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label className="crm-label">Record a payment</label>
            <div className="edit-grid">
              <input className="crm-input" inputMode="numeric" placeholder="Amount (THB)" value={payment.amount}
                disabled={busy} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} />
              <input className="crm-input" type="date" value={payment.at}
                disabled={busy} onChange={(e) => setPayment((p) => ({ ...p, at: e.target.value }))} />
              <input className="crm-input" placeholder="Reference" value={payment.reference}
                disabled={busy} onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))} />
              <input className="crm-input" placeholder="Against (unit or deal)" value={payment.against}
                disabled={busy} onChange={(e) => setPayment((p) => ({ ...p, against: e.target.value }))} />
            </div>
            <button
              className="crm-btn sm"
              style={{ marginTop: 10 }}
              disabled={busy || !payment.amount.trim() || !payment.at}
              onClick={async () => {
                await send({ op: 'addPayment', payment: { ...payment, amount: Number(payment.amount) } });
                setPayment({ amount: '', at: '', reference: '', against: '' });
              }}
            >
              Add
            </button>
            <div className="crm-meta" style={{ marginTop: 8 }}>
              Nothing here can be deleted. A payment entered by mistake is corrected with a
              <strong> negative</strong> amount, so the trail stays intact.
            </div>
          </div>
        </div>

        <PortalAccess agency={agency} />

        <div className="crm-card">
          <h3>The relationship</h3>
          {agency.archived_at ? (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Archived{agency.archived_by ? ` by ${agency.archived_by}` : ''}. Out of every picker and every
                report — but every registration made under this name is still on the buyers it was made
                against, because that is what decides who introduced them.
              </div>
              <button className="crm-btn sm" disabled={busy} onClick={() => send({ op: 'unarchive' })}>
                Work with them again
              </button>
            </>
          ) : (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Ending the relationship archives the agency. Nothing is deleted: the registrations stay on
                the buyers, so a sale that completes next year is still credited to whoever introduced it.
              </div>
              <button
                className="crm-btn danger sm"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Archive ${agency.name}?\n\nThey leave every picker and every report. Their registrations stay on the buyers, and this can be undone.`)) {
                    send({ op: 'archive' });
                  }
                }}
              >
                End the relationship
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

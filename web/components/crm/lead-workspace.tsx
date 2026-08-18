'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead, Score, Stage } from '@/lib/crm/types';
import {
  CURRENCIES, DECISION, FINANCING, LOST_REASONS, MOTIVATIONS, NURTURE_REASONS, OBJECTIONS,
  PURPOSES, SCORES, STAGES, TIMEFRAMES, TOUCHES, VISITS, atOrBeyond,
} from '@/lib/crm/types';
import { REPLY_FLAG_DAYS, creditedClaim, isNurtured, missingQualification } from '@/lib/crm/rules';
import { fmtTHB } from '@/lib/crm/villas';
import { messageTemplates } from '@/lib/crm/templates';
import { SEQUENCE_STEPS, sequenceState, stepLabel } from '@/lib/crm/sequence';
import { DOCUMENTS } from '@/lib/crm/documents';
import { COUNTRIES, countryName, guessLanguage, languageLabel, languageName, leadCountry } from '@/lib/crm/language';
import { LostReasonDialog } from '@/components/crm/lost-reason-dialog';
import { engagementScore, fitScore, scoreVerdict } from '@/lib/crm/scores';
import type { Rates } from '@/lib/crm/money';

/* What the picker needs about an agency — not the whole record, and not the
   commission terms, which have no business crossing to the browser on a lead
   page. */
export interface AgencyOption {
  id: string;
  name: string;
  contacts: { id: string; name: string }[];
}

/* Fixed locale + UTC: the server prerender and the browser must produce the
   same text, or React reports a hydration mismatch on every page load. */
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', dateStyle: 'medium' }) : '';
const digits = (s?: string) => (s || '').replace(/[^\d]/g, '');
/* A lead's email is untrusted public-form input. Only well-formed addresses
   get clickable mailto links — '?bcc=…' style header injection stays inert. */
const safeEmail = (s?: string) => (s && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(s) ? s : null);

const CONTACT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'villa', label: 'Villa' },
] as const;

export function LeadWorkspace({
  lead: initial, related = [], roster = [], agencies = [], today, rates = {},
  admin = false, canReassign = false, readOnly = false,
}: {
  lead: Lead;
  related?: Lead[];
  roster?: string[];
  /** Partner agencies a buyer can be registered against — the roster's
      equivalent for the firms that introduce them. Server-loaded, like the
      roster, because the workspace is a client component. */
  agencies?: AgencyOption[];
  today: string;
  /** Exchange rates, from the server. Passed rather than read here because
      `CRM_FX` is not a public variable — reading it in the browser would give
      an empty set, and the fit score would differ between the server render
      and the client one. */
  rates?: Rates;
  /** Withdrawing a registration and recording over another agency's live claim
      both decide who gets paid. Hidden rather than shown-and-refused. */
  admin?: boolean;
  /** May move a lead that already belongs to somebody else. An agent may pick
      up an unassigned one; only the head of sales may take one off a
      colleague. Disabled rather than refused on save, so nobody discovers the
      rule by having their change rejected. */
  canReassign?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initial);
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busyState, setBusy] = useState(false);
  const busy = busyState || readOnly; // readOnly locks every mutating control
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [valueDraft, setValueDraft] = useState(initial.value ? String(initial.value) : '');
  const [valueDirty, setValueDirty] = useState(false);
  const [tpl, setTpl] = useState(0);
  const [copied, setCopied] = useState('');
  const [losing, setLosing] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(initial.qualification?.budget ? String(initial.qualification.budget) : '');
  const [budgetDirty, setBudgetDirty] = useState(false);
  const [nurtureDate, setNurtureDate] = useState('');
  const [nurtureReason, setNurtureReason] = useState<string>(NURTURE_REASONS[0].id);
  /* Parked and still waiting, versus parked and the date has come — the panel
     reads very differently either way, and so does the day list. */
  const [regAgency, setRegAgency] = useState('');
  const [regBroker, setRegBroker] = useState('');
  /* What the dialling code says, so the picker can label its "leave it to the
     phone number" option with the answer that will actually be used. */
  const derivedCountry = guessLanguage(lead).country;
  const parked = isNurtured(lead, today);
  const lockedOwner = Boolean(lead.owner) && !canReassign && !readOnly;
  const fit = fitScore(lead, rates);
  const engagement = engagementScore(lead);
  const verdict = scoreVerdict(fit, engagement);
  const claims = lead.claims || [];
  const credited = creditedClaim(lead);
  const todayStr = today;
  const regContacts = agencies.find((a) => a.id === regAgency)?.contacts || [];
  /* The earliest date the picker offers. Derived from the server's `today`,
     not the browser's, because the server is what validates it — a laptop set
     a day ahead should not be able to offer a date the API will refuse. */
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const earliest = tomorrow.toISOString().slice(0, 10);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      /* A refusal used to vanish: the button un-busied itself and nothing
         changed on screen, which reads exactly like a bug. The server sends a
         sentence an operator can act on — show it. */
      if (!res.ok) alert(data?.error || 'That change could not be saved. Try again.');
      if (data.lead) {
        setLead(data.lead);
        // Keep the deal-value input in sync with server truth (merge can fill
        // it) — but never while the operator is mid-edit.
        if (!valueDirty) setValueDraft(data.lead.value ? String(data.lead.value) : '');
        if (!budgetDirty) setBudgetDraft(data.lead.qualification?.budget ? String(data.lead.qualification.budget) : '');
      }
    } finally {
      setBusy(false);
    }
  }

  /* ── Pressing Email / WhatsApp / Call ──

     The click's real job is opening the mail client, WhatsApp or the dialler,
     and that must happen whatever the network does. So this rides alongside
     it: never awaited, never blocking, and a failure is silent — the operator
     is already in another app, and an alert they will never see is worse than
     a missing timeline line. The server records that the channel was OPENED,
     not that anything was sent. */
  function noteOutreach(channel: 'email' | 'whatsapp' | 'phone') {
    if (readOnly) return;
    fetch(`/api/crm/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'outreach', channel }),
      keepalive: true,
    })
      .then((res) => res.json())
      .then((data) => { if (data?.lead) setLead(data.lead); })
      .catch(() => { /* the message still went out; the line can be added by hand */ });
  }

  /* ── Recording a registration ──

     The 409 is the interesting path: another agency's protection window is
     still open. The server sends back who holds it and until when, and the
     only way past it is somebody with the authority deciding to record over
     the top — which is then part of the claim, not a quiet overwrite. */
  async function registerAgency(override: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'register', agencyId: regAgency, brokerId: regBroker || undefined, override }),
      });
      const data = await res.json();
      if (res.status === 409) {
        const name = agencies.find((a) => a.id === regAgency)?.name || 'this agency';
        if (!admin) {
          alert(`${data.error}\n\nRecording ${name} over that claim is the owner's decision — ask them.`);
          return;
        }
        if (confirm(`${data.error}\n\nRecord ${name} over that claim anyway?\n\nBoth registrations stay on the record, and this one will say it went over the earlier one.`)) {
          await registerAgency(true);
        }
        return;
      }
      if (!res.ok) { alert(data?.error || 'The registration could not be recorded.'); return; }
      if (data.lead) setLead(data.lead);
      setRegAgency('');
      setRegBroker('');
    } finally {
      setBusy(false);
    }
  }

  async function setStage(stage: Stage) {
    // A lost deal without a reason is a lesson wasted — the dialog enforces one.
    if (stage === 'lost') {
      setLosing(true);
      return;
    }
    /* Moving past Qualified on answers nobody has is allowed — it is judgement,
       and a CRM that argues with a salesperson about what a conversation
       established is one they stop updating. But it is not allowed SILENTLY:
       the gaps are named here, and they are written onto the timeline entry. */
    if (atOrBeyond(stage, 'qualified') && missing.length) {
      const ok = confirm(
        `Move to ${STAGES.find((s) => s.id === stage)?.label} with ${missing.join(', ').toLowerCase()} still unknown?\n\n` +
        'The move is recorded with that gap on it.',
      );
      if (!ok) return;
    }
    await patch({ op: 'update', patch: { stage } });
  }

  async function confirmLost(reasonId: string, detail: string) {
    setLosing(false);
    const label = LOST_REASONS.find((r) => r.id === reasonId)?.label || reasonId;
    await patch({ op: 'update', patch: { stage: 'lost', lost_reason: reasonId } });
    await patch({ op: 'addNote', body: `Lost: ${label}${detail ? ` — ${detail}` : ''}` });
  }

  function startEdit() {
    setDraft({
      ...Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, lead[f.key] || ''])),
      country: lead.country || '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    const changes: Record<string, string> = {};
    for (const f of CONTACT_FIELDS) {
      if ((draft[f.key] || '') !== (lead[f.key] || '')) changes[f.key] = (draft[f.key] || '').trim();
    }
    // Country is a picker rather than one of the text fields, but it saves the
    // same way — and an empty value clears it back to the phone-number reading.
    if ((draft.country || '') !== (lead.country || '')) changes.country = draft.country || '';
    if (Object.keys(changes).length) await patch({ op: 'update', patch: changes });
    setEditing(false);
  }

  /* Archiving takes the lead out of every view and keeps everything about it.
     It is what "get rid of this" almost always means, and it can be undone. */
  async function archive(block = false) {
    const msg = block
      ? 'Archive this lead AND block the contact?\n\nThe history is kept and can be restored. Blocking means future WhatsApp messages from this number or e-mail never create a lead again.'
      : 'Archive this lead?\n\nIt leaves every list, count and report, and the automated e-mails stop. Nothing is lost — you can restore it.';
    if (!confirm(msg)) return;
    await fetch(`/api/crm/leads/${lead.id}${block ? '?block=1' : ''}`, { method: 'DELETE' });
    router.replace('/admin/leads');
    router.refresh();
  }

  async function restore() {
    await patch({ op: 'unarchive' });
    router.refresh();
  }

  /* The real erasure, for a deletion request. Only reachable on a lead that is
     already archived, so it can never be the same click as tidying up. */
  async function purge() {
    if (!confirm(
      `Permanently delete ${lead.name || 'this lead'}?\n\n` +
      'This destroys the timeline, the notes and the source attribution for good. ' +
      'There is no undo and no copy except last night\u2019s backup.\n\n' +
      'Use this only for a genuine erasure request.',
    )) return;
    const res = await fetch(`/api/crm/leads/${lead.id}?purge=1`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || 'The delete did not go through.');
      return;
    }
    router.replace('/admin/leads');
    router.refresh();
  }

  async function saveValue() {
    if (!valueDirty) return; // untouched input must never clear a value set elsewhere (e.g. by a merge)
    const cleaned = valueDraft.replace(/[,\s]/g, '');
    const parsed = cleaned ? Number(cleaned) : null;
    if (parsed !== null && (!isFinite(parsed) || parsed < 0)) {
      // Not a number — restore what the lead actually has instead of guessing.
      setValueDraft(lead.value ? String(lead.value) : '');
      setValueDirty(false);
      return;
    }
    const n = parsed === null || parsed === 0 ? null : Math.round(parsed);
    setValueDirty(false);
    if (n === (lead.value ?? null)) return;
    await patch({ op: 'update', patch: { value: n } });
  }

  /** Each field saves the moment it changes; the store validates and logs it. */
  const qualify = (fields: Record<string, unknown>) => patch({ op: 'qualify', patch: fields });

  async function saveBudget() {
    if (!budgetDirty) return; // an untouched field must never clear what is stored
    const cleaned = budgetDraft.replace(/[,\s]/g, '');
    const parsed = cleaned ? Number(cleaned) : null;
    if (parsed !== null && (!isFinite(parsed) || parsed < 0)) {
      setBudgetDraft(lead.qualification?.budget ? String(lead.qualification.budget) : '');
      setBudgetDirty(false);
      return;
    }
    setBudgetDirty(false);
    const n = parsed === null || parsed === 0 ? undefined : Math.round(parsed);
    if (n === lead.qualification?.budget) return;
    await patch({ op: 'qualify', patch: { budget: n ?? null } });
  }

  async function merge(otherId: string) {
    if (!confirm('Merge that enquiry into this lead?\n\nIts notes, tasks and history move here, and the duplicate is archived with a note saying where it went. Nothing is destroyed.')) return;
    await patch({ op: 'merge', otherId });
    router.refresh();
  }

  const wa = digits(lead.whatsapp || lead.phone);
  const attribution: [string, string | undefined][] = [
    ['Source', lead.source || lead.utm_source],
    ['Medium', lead.utm_medium],
    ['Campaign', lead.utm_campaign],
    ['Term', lead.utm_term],
    ['Content', lead.utm_content],
    ['Landing', lead.page_url],
  ];

  const templates = messageTemplates(lead);
  const missing = missingQualification(lead);

  // One merged timeline: manual notes and automatic history, newest first.
  const timeline = [
    ...lead.notes.map((n) => ({ id: n.id, at: n.at, body: n.body, kind: 'note' as const, by: n.by })),
    ...(lead.history || []).map((h) => ({ id: h.id, at: h.at, body: h.detail, kind: h.kind, by: h.by })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="crm-detail">
      {lead.archived_at && (
        <div
          className="crm-card"
          style={{
            gridColumn: '1 / -1',
            borderColor: 'var(--c-hot)',
            display: 'flex', flexWrap: 'wrap', gap: 12,
            alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ color: 'var(--c-hot)', fontWeight: 600 }}>Archived</div>
            <div className="crm-meta" style={{ marginTop: 4 }}>
              {fmtDate(lead.archived_at)}
              {lead.archived_by ? ` · ${lead.archived_by}` : ''}
              {lead.archive_reason ? ` · ${lead.archive_reason}` : ''}
              {' · '}Hidden from every list, count and report. The automated e-mails have stopped.
            </div>
          </div>
          {!readOnly && (
            <button className="crm-btn gold sm" disabled={busy} onClick={restore}>Restore</button>
          )}
        </div>
      )}
      {/* ── Left column ── */}
      <div className="stack">
        {/* Contact + quick actions */}
        <div className="crm-card">
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Contact
            {!editing && !readOnly && (
              <button className="crm-btn ghost sm" onClick={startEdit} style={{ textTransform: 'none', letterSpacing: 0 }}>
                Edit
              </button>
            )}
          </h3>
          {editing ? (
            <div className="edit-grid">
              {CONTACT_FIELDS.map((f) => (
                <label key={f.key}>
                  <span className="crm-label">{f.label}</span>
                  <input
                    className="crm-input"
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
              {/* A picker, not a text box: "UK", "United Kingdom" and "England"
                  typed into three leads is three rows in a report. Left empty
                  the dialling code answers it, which is right far more often
                  than not — this is for the cases it gets wrong, and a British
                  buyer calling from a Dubai number is a real one. */}
              <label>
                <span className="crm-label">Country</span>
                <select
                  className="crm-select"
                  value={draft.country || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))}
                >
                  <option value="">From the phone number{derivedCountry ? ` · ${countryName(derivedCountry)}` : ''}</option>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </label>
              <div className="act-row" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <button className="crm-btn gold sm" disabled={busy} onClick={saveEdit}>Save</button>
                <button className="crm-btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <dl className="kv">
                <dt>Name</dt><dd>{lead.name || '—'}</dd>
                <dt>Email</dt><dd>{lead.email || '—'}</dd>
                <dt>Phone</dt><dd>{lead.phone || '—'}</dd>
                {lead.whatsapp && <><dt>WhatsApp</dt><dd>{lead.whatsapp}</dd></>}
                <dt>Enquiry</dt>
                <dd>
                  {lead.form_type || '—'}
                  {lead.form_origin ? <span className="muted"> · {lead.form_origin}</span> : null}
                  {lead.villa ? <span className="muted"> · {lead.villa}</span> : null}
                </dd>
                <dt>Country</dt>
                <dd>
                  {countryName(leadCountry(lead)) || '—'}
                  {!lead.country && derivedCountry && <span className="muted"> · from the phone number</span>}
                </dd>
                <dt>Received</dt><dd>{fmtDate(lead.submitted_at || lead.created_at)}</dd>
                <dt>Consent</dt><dd>{lead.gdpr_consent ? 'GDPR consent given' : '—'}</dd>
              </dl>
              <div className="act-row" style={{ marginTop: 18 }}>
                {safeEmail(lead.email) && <a className="crm-btn sm" href={`mailto:${safeEmail(lead.email)}`} onClick={() => noteOutreach('email')}>✉ Email</a>}
                {wa && <a className="crm-btn sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" onClick={() => noteOutreach('whatsapp')}>WhatsApp</a>}
                {lead.phone && <a className="crm-btn sm" href={`tel:${digits(lead.phone)}`} onClick={() => noteOutreach('phone')}>Call</a>}
                {/* Opens the offer filled from this lead: their name, their
                    residence, the payment schedule worked out from the price.
                    Print or save as PDF from the page itself. */}
                {!readOnly && (
                  <a className="crm-btn sm" href={`/api/crm/leads/${lead.id}/offer`} target="_blank" rel="noreferrer">
                    Offer
                  </a>
                )}
              </div>

              {/* One-click reply templates — open the mail/WhatsApp client prefilled */}
              {(safeEmail(lead.email) || wa) && (
                <div className="tpl-row">
                  <select className="crm-select sm" value={tpl} aria-label="Message template" onChange={(e) => setTpl(Number(e.target.value))}>
                    {templates.map((t, i) => <option key={t.id} value={i}>{t.label}</option>)}
                  </select>
                  {safeEmail(lead.email) && (
                    <a
                      className="crm-btn sm"
                      href={`mailto:${safeEmail(lead.email)}?subject=${encodeURIComponent(templates[tpl].subject)}&body=${encodeURIComponent(templates[tpl].body)}`}
                      onClick={() => noteOutreach('email')}
                    >
                      Draft email
                    </a>
                  )}
                  {wa && (
                    <a
                      className="crm-btn sm"
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(templates[tpl].body)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => noteOutreach('whatsapp')}
                    >
                      Draft WhatsApp
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Other enquiries from the same person */}
        {related.length > 0 && (
          <div className="crm-card">
            <h3>Same contact · {related.length} more {related.length === 1 ? 'enquiry' : 'enquiries'}</h3>
            {related.map((r) => (
              <div key={r.id} className="related-row">
                <Link href={`/admin/leads/${r.id}`} className="crm-row" style={{ minWidth: 0, flex: 1 }}>
                  <div className="crm-name" style={{ textTransform: 'capitalize' }}>{(r.form_type || 'enquiry').replace('_', ' ')}{r.villa ? ` · ${r.villa}` : ''}</div>
                  <div className="crm-meta">{fmtDate(r.submitted_at || r.created_at)}</div>
                </Link>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span className="badge stage">{STAGES.find((s) => s.id === r.stage)?.label}</span>
                  {!readOnly && (
                    <button className="crm-btn ghost sm" disabled={busy} onClick={() => merge(r.id)} title="Pull its notes and history into this lead, then delete it">
                      Merge in
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Attribution */}
        <div className="crm-card">
          <h3>Attribution</h3>
          <dl className="kv">
            {attribution.map(([k, v]) => (
              <FragmentRow key={k} k={k} v={v} />
            ))}
          </dl>
        </div>

        {/* ── Who introduced this buyer ──

            The argument this panel exists to end: "we introduced that buyer to
            you in March." Before this, an introducing agency was a free-text
            word in the source field with no date on it, and the answer lived
            in somebody's inbox.

            A registration is append-only. Nothing here edits or removes a
            claim; withdrawing one leaves it on the record with the reason. */}
        <div className="crm-card">
          <h3>Introduced by</h3>

          {claims.length === 0 && (
            <div className="crm-meta" style={{ marginBottom: 14 }}>
              No agency has registered this buyer. They came to us directly.
            </div>
          )}

          {claims.map((c) => {
            const open = !c.released_at && (!c.expires_at || c.expires_at >= todayStr);
            return (
              <div key={c.id} className="claim">
                <div className="claim-head">
                  <span className="crm-name">{c.agencyName}</span>
                  <span className={`badge ${c.released_at ? 'cold' : open ? 'hot' : 'stage'}`}>
                    {c.released_at ? 'withdrawn' : open ? 'protected' : 'window closed'}
                  </span>
                </div>
                <div className="crm-meta">
                  {c.brokerName ? `${c.brokerName} · ` : ''}registered {fmtDay(c.at)}
                  {c.expires_at && !c.released_at ? ` · ${open ? 'protected to' : 'ran to'} ${fmtDay(c.expires_at)}` : ''}
                  {c.by ? ` · recorded by ${c.by}` : ''}
                </div>
                {c.note && <div className="crm-meta" style={{ marginTop: 4 }}>“{c.note}”</div>}
                {c.overrode && (
                  <div className="crm-meta" style={{ marginTop: 4, color: 'var(--c-hot)' }}>
                    Recorded over an earlier claim.
                  </div>
                )}
                {c.released_at && (
                  <div className="crm-meta" style={{ marginTop: 4 }}>
                    Withdrawn {fmtDay(c.released_at)} — {c.release_reason}
                  </div>
                )}
                {admin && !c.released_at && (
                  <button
                    className="crm-btn ghost sm"
                    style={{ marginTop: 8 }}
                    disabled={busy}
                    onClick={async () => {
                      const why = window.prompt(
                        'Why is this registration being withdrawn?\n\nIt stays on the record with the reason — this is not a delete.',
                      );
                      if (why && why.trim()) await patch({ op: 'releaseClaim', claimId: c.id, reason: why });
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            );
          })}

          {credited && claims.filter((c) => !c.released_at).length > 1 && (
            <div className="lost-hint" style={{ marginTop: 4 }}>
              More than one agency is claiming this buyer. <strong>{credited.agencyName}</strong> registered
              them first and is who the reports credit.
            </div>
          )}

          {!readOnly && agencies.length > 0 && (
            <div style={{ marginTop: claims.length ? 16 : 0 }}>
              <label className="crm-label">Register an agency</label>
              <select
                className="crm-select"
                value={regAgency}
                onChange={(e) => { setRegAgency(e.target.value); setRegBroker(''); }}
              >
                <option value="">Choose an agency…</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {regContacts.length > 0 && (
                <select className="crm-select" style={{ marginTop: 8 }} value={regBroker} onChange={(e) => setRegBroker(e.target.value)}>
                  <option value="">Which agent? (optional)</option>
                  {regContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button
                className="crm-btn sm"
                style={{ marginTop: 10 }}
                disabled={busy || !regAgency}
                onClick={() => registerAgency(false)}
              >
                Record registration
              </button>
            </div>
          )}
          {!readOnly && agencies.length === 0 && (
            <div className="crm-meta" style={{ marginTop: 12 }}>
              No partner agencies on file yet. <Link href="/admin/agencies" style={{ color: 'var(--c-gold)' }}>Add one</Link> first.
            </div>
          )}
        </div>

        {/* ── Qualification ──

            The four answers that decide whether somebody is a buyer, and four
            more that decide how to sell to them. All of this lived in notes
            before, where it could not be filtered, counted, or relied on by
            anything. Every field saves on change: a form with a Save button is
            a form that gets half filled and abandoned. */}
        <div className="crm-card">
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            Qualification
            {missing.length > 0 && (
              <span className="crm-meta" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Still unknown: {missing.join(', ')}
              </span>
            )}
          </h3>

          <div className="qual-grid">
            <div>
              <label className="crm-label" htmlFor="q-budget">Budget</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="q-budget"
                  className="crm-input"
                  inputMode="numeric"
                  placeholder="e.g. 9000000"
                  value={budgetDraft}
                  disabled={busy}
                  onChange={(e) => { setBudgetDraft(e.target.value); setBudgetDirty(true); }}
                  onBlur={saveBudget}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <select
                  className="crm-select"
                  style={{ width: 90 }}
                  value={lead.qualification?.currency || 'THB'}
                  disabled={busy}
                  aria-label="Budget currency"
                  onChange={(e) => qualify({ currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {([
              ['timeframe', 'Timeframe', TIMEFRAMES],
              ['purpose', 'Purpose', PURPOSES],
              ['financing', 'Funding', FINANCING],
              ['decision', 'Decision maker', DECISION],
              ['visit', 'Samui visit', VISITS],
              ['motivation', 'Motivation', MOTIVATIONS],
              ['objection', 'Objection', OBJECTIONS],
            ] as const).map(([key, label, options]) => (
              <div key={key}>
                <label className="crm-label" htmlFor={`q-${key}`}>{label}</label>
                <select
                  id={`q-${key}`}
                  className="crm-select"
                  value={(lead.qualification?.[key] as string) || ''}
                  disabled={busy}
                  onChange={(e) => qualify({ [key]: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Notes + full history */}
        <div className="crm-card">
          <h3>Notes & activity</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <textarea
              className="crm-textarea"
              placeholder="Log a call, add a note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="act-row" style={{ alignItems: 'center' }}>
            <button
              className="crm-btn gold sm"
              disabled={busy || !note.trim()}
              onClick={async () => { await patch({ op: 'addNote', body: note }); setNote(''); }}
            >
              Add note
            </button>

            {/* ── Log what actually happened ──

                The box above already said "Log a call" and could only produce a
                note. These make it true: one click after putting the phone
                down, with whatever is in the box carried across as the detail.
                Kept to one click because the moment they are used is the moment
                somebody wants to get on with the next call — anything longer
                and the log stops being filled in, which is worse than not
                having it. */}
            {!readOnly && (
              <>
                <span className="crm-meta" style={{ marginLeft: 4 }}>Log:</span>
                {TOUCHES.map((t) => (
                  <button
                    key={t.key}
                    className="crm-btn sm"
                    disabled={busy}
                    title={t.reached
                      ? 'Records a real conversation: stops the automated e-mails and moves a new lead to Contacted'
                      : 'Records the attempt only — nothing downstream treats it as contact'}
                    onClick={async () => {
                      await patch({ op: 'logTouch', touch: t.key, note });
                      setNote('');
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </>
            )}
          </div>
          <ul className="timeline" style={{ marginTop: 16 }}>
            {timeline.length === 0 && <div className="empty">No activity yet.</div>}
            {timeline.map((item) => (
              <li key={item.id} className={item.kind !== 'note' ? 'auto' : undefined}>
                {item.kind !== 'note' && <span className="badge stage tl-badge">{item.kind === 'created' ? 'new lead' : item.kind}</span>}
                {item.body}
                {/* Who did it, once more than one person is signed in. Entries
                    with nobody named were the CRM's own doing. */}
                <div className="t">{fmtDate(item.at)}{item.by ? ` · ${item.by}` : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="stack">
        {/* ── Fit and engagement ──

            Kept apart on purpose. Mixing them produces the two most expensive
            mistakes in a pipeline: a buyer with the money and the timing who
            has gone quiet reads as "cold" and gets dropped, and somebody who
            replies to everything and cannot afford an entry-level villa reads
            as "hot" and eats a fortnight. Both are derived — correcting a
            budget corrects the score on the next render. */}
        <div className="crm-card">
          <h3>Fit &amp; engagement</h3>
          <div className="score-pair">
            {[
              { label: 'Can they buy', s: fit },
              { label: 'Are they talking to us', s: engagement },
            ].map(({ label, s }) => (
              <div key={label} className="score-block">
                <div className="crm-meta">{label}</div>
                <div className={`score-bar ${s.band}`}><i style={{ width: `${s.pct}%` }} /></div>
                <div className="crm-meta tabnum">{s.pct}%</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontWeight: 600 }}>{verdict}</div>
          {fit.reasons.concat(engagement.reasons).length > 0 && (
            <div className="crm-meta" style={{ marginTop: 8 }}>
              {fit.reasons.concat(engagement.reasons).join(' · ')}
            </div>
          )}
          {fit.missing.length > 0 && (
            <div className="crm-meta" style={{ marginTop: 6, color: 'var(--c-warm)' }}>
              Nobody has asked: {fit.missing.join(', ').toLowerCase()}
            </div>
          )}
        </div>

        {/* Stage / score */}
        <div className="crm-card">
          <h3>Status</h3>
          <label className="crm-label">Stage</label>
          <select
            className="crm-select"
            value={lead.stage}
            disabled={busy}
            onChange={(e) => setStage(e.target.value as Stage)}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {/* What the stage MEANS. "Presentation" only stops being a guess
              once it says that a presentation actually happened, and a stage
              everybody reads differently is a funnel that measures nothing. */}
          <div className="crm-meta" style={{ margin: '6px 0 16px' }}>
            {STAGES.find((s) => s.id === lead.stage)?.blurb}
          </div>
          <label className="crm-label">Score</label>
          <select
            className="crm-select"
            value={lead.score}
            disabled={busy}
            onChange={(e) => patch({ op: 'update', patch: { score: e.target.value as Score } })}
          >
            {SCORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          {/* Language — read off the phone number where possible, so the lead
              can be handed to someone who speaks it. Derived, never stored:
              correcting the phone number corrects this line immediately. */}
          {(() => {
            const g = guessLanguage(lead);
            if (g.from === 'none') return null;
            const source = { phone: 'from their phone number', browsing: 'from the language they browsed in', email: 'from their e-mail domain', none: '' }[g.from];
            return (
              <>
                <label className="crm-label" style={{ marginTop: 16 }}>Language</label>
                <div style={{ fontWeight: 600 }}>{languageLabel(g)}</div>
                <div className="crm-meta" style={{ marginTop: 2 }}>
                  {source}
                  {g.alsoSpoken.length ? ` · also likely: ${g.alsoSpoken.map(languageName).join(', ')}` : ''}
                </div>
              </>
            );
          })()}

          {/* Owner — who this lead belongs to. Every automatic e-mail goes out
              signed by this person, so it is never an anonymous "team" mail. */}
          {(roster.length > 0 || lead.owner) && (
            <>
              <label className="crm-label" style={{ marginTop: 16 }}>Owner</label>
              {lockedOwner && (
                <div className="crm-meta" style={{ marginTop: 6 }}>
                  This lead belongs to {lead.owner}. Picking up an unassigned lead is stepping in;
                  taking one off a colleague is the head of sales&rsquo; call.
                </div>
              )}
              {roster.length > 1 || (lead.owner && !roster.includes(lead.owner)) ? (
                <select
                  className="crm-select"
                  value={lead.owner || ''}
                  disabled={busy || lockedOwner}
                  onChange={(e) => patch({ op: 'update', patch: { owner: e.target.value } })}
                >
                  <option value="">Unassigned</option>
                  {lead.owner && !roster.includes(lead.owner) && <option value={lead.owner}>{lead.owner}</option>}
                  {roster.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <div className="crm-meta">{lead.owner || roster[0] || '—'}</div>
              )}
            </>
          )}
          <label className="crm-label" style={{ marginTop: 16 }}>Deal value (THB)</label>
          <input
            className="crm-input"
            inputMode="numeric"
            value={valueDraft}
            disabled={busy}
            onChange={(e) => { setValueDraft(e.target.value); setValueDirty(true); }}
            onBlur={saveValue}
            placeholder="e.g. 8050000"
          />
          {lead.value ? <div className="crm-meta" style={{ marginTop: 6 }}>{fmtTHB(lead.value)}</div> : null}
          <div style={{ marginTop: 16 }}>
            <span className={`badge ${lead.score}`}>{lead.score}</span>{' '}
            <span className="badge stage">{STAGES.find((s) => s.id === lead.stage)?.label}</span>
          </div>
        </div>

        {/* Response tracking — "we emailed them, did they come back?" */}
        <div className="crm-card">
          <h3>Response tracking</h3>
          {lead.awaiting_reply_since ? (() => {
            const days = Math.floor((Date.now() - new Date(lead.awaiting_reply_since!).getTime()) / 86_400_000);
            const late = days >= REPLY_FLAG_DAYS;
            return (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, color: late ? 'var(--c-hot)' : 'var(--c-cream)' }}>
                    {late ? '⚠ ' : ''}Awaiting reply · {days} {days === 1 ? 'day' : 'days'}
                  </div>
                  <div className="crm-meta">Since {fmtDate(lead.awaiting_reply_since)}</div>
                  {days >= 5 && (
                    <div className="crm-meta" style={{ color: 'var(--c-hot)', marginTop: 6 }}>
                      Two silent follow-ups — time to switch channel: call or WhatsApp.
                    </div>
                  )}
                </div>
                <button className="crm-btn gold sm" disabled={busy} onClick={() => patch({ op: 'awaiting', on: false })}>
                  Reply received
                </button>
              </>
            );
          })() : (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Sent an email or offer? Start the timer — after 3 quiet days the lead (and its plot on the
                masterplan) is flagged and a follow-up task is created automatically.
              </div>
              <button className="crm-btn sm" disabled={busy} onClick={() => patch({ op: 'awaiting', on: true })}>
                ✉ Email sent — awaiting reply
              </button>
            </>
          )}
        </div>

        {/* ── Not now ──

            The third answer, between "closed lost" and "leave it sitting in
            Qualified going stale". In this business the six-to-eighteen-month
            wait is normal, and both of the other answers destroy something:
            one buries the lead, the other trains everybody to ignore the
            stalled flag. */}
        <div className="crm-card">
          <h3>Not now</h3>
          {lead.nurture_until ? (
            <>
              <div style={{ fontWeight: 600 }}>
                {parked ? 'Parked until ' : '⚠ Was parked until '}{fmtDay(lead.nurture_until)}
              </div>
              <div className="crm-meta" style={{ marginTop: 4 }}>
                {NURTURE_REASONS.find((r) => r.id === lead.nurture_reason)?.label || 'No reason recorded'}
              </div>
              <div className="crm-meta" style={{ marginTop: 8 }}>
                {parked
                  ? 'Out of the day list, out of the automated e-mails, and no stall flag until that date.'
                  : 'The date has come — this lead is back in the day list.'}
              </div>
              {!readOnly && (
                <button className="crm-btn sm" style={{ marginTop: 12 }} disabled={busy}
                  onClick={() => patch({ op: 'nurture' })}>
                  Back in play now
                </button>
              )}
            </>
          ) : !readOnly ? (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Buying, but not yet? Pick the date to come back to them. The lead keeps its stage and
                everything on it, and simply stops asking for attention until then.
              </div>
              <label className="crm-label">Come back on</label>
              <input
                className="crm-input"
                type="date"
                value={nurtureDate}
                min={earliest}
                onChange={(e) => setNurtureDate(e.target.value)}
              />
              <label className="crm-label" style={{ marginTop: 12 }}>What are we waiting for</label>
              <select className="crm-select" value={nurtureReason} onChange={(e) => setNurtureReason(e.target.value)}>
                {NURTURE_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button
                className="crm-btn sm"
                style={{ marginTop: 12 }}
                disabled={busy || !nurtureDate}
                onClick={async () => {
                  await patch({ op: 'nurture', until: nurtureDate, reason: nurtureReason });
                  setNurtureDate('');
                }}
              >
                Park until then
              </button>
            </>
          ) : (
            <div className="crm-meta">Working normally — not parked.</div>
          )}
        </div>

        {/* Documents — a tracked link per document, for sending by hand over
            WhatsApp or a personal e-mail. Every open lands on the timeline, so
            "did they actually read it?" stops being guesswork. */}
        <div className="crm-card">
          <h3>Documents</h3>
          {DOCUMENTS.map((d) => {
            const opens = (lead.history || []).filter((h) => h.kind === 'download' && h.detail === `Opened: ${d.title}`);
            const last = opens[opens.length - 1];
            return (
              <div key={d.id} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600 }}>{d.title}</div>
                <div className="crm-meta" style={{ marginTop: 2 }}>{d.note}</div>
                <div className="crm-meta" style={{ marginTop: 6, color: last ? 'var(--c-cream)' : undefined }}>
                  {last
                    ? `Opened ${opens.length}× · last ${fmtDate(last.at)}`
                    : 'Not opened yet'}
                </div>
                <button
                  className="crm-btn sm"
                  style={{ marginTop: 8 }}
                  onClick={async () => {
                    const url = `${window.location.origin}/d/${d.id}?l=${lead.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(d.id);
                      setTimeout(() => setCopied(''), 2000);
                    } catch {
                      window.prompt('Copy this link:', url); // clipboard blocked (http, old browser)
                    }
                  }}
                >
                  {copied === d.id ? '✓ Link copied' : 'Copy tracked link'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Automatic sequence — what the engine has sent and what comes next,
            so the operator is never surprised by a mail going out. */}
        {(() => {
          const seq = sequenceState(lead);
          const sent = lead.outbox || [];
          return (
            <div className="crm-card">
              <h3>Automatic sequence</h3>
              {seq.active ? (
                <div style={{ marginBottom: sent.length ? 12 : 0 }}>
                  <div style={{ fontWeight: 600 }}>{seq.sent} of {SEQUENCE_STEPS.length} sent</div>
                  {seq.next && (
                    <div className="crm-meta" style={{ marginTop: 4 }}>
                      Next: <b>{seq.next.label}</b> · {seq.next.note.toLowerCase()}
                      <br />due {fmtDay(seq.nextDate)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="crm-meta" style={{ marginBottom: sent.length ? 12 : 0 }}>
                  Not running — {seq.reason.toLowerCase()}.
                </div>
              )}
              {sent.length > 0 && (
                <ul className="timeline">
                  {sent.map((e) => (
                    <li key={e.id} className="auto">
                      <span className="badge stage tl-badge">{stepLabel(e.step)}</span>
                      {e.subject}
                      <div className="t">{fmtDate(e.at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Tasks */}
        <div className="crm-card">
          <h3>Follow-up tasks</h3>
          <div>
            {lead.tasks.length === 0 && <div className="empty">No tasks yet.</div>}
            {lead.tasks.map((tk) => {
              // Calendar-date comparison — a task due today is not "overdue".
              const over = !tk.done && tk.due && tk.due.slice(0, 10) < new Date().toISOString().slice(0, 10);
              return (
                <div key={tk.id} className={`task${tk.done ? ' done' : ''}`}>
                  {/* disabled while busy: two quick un-awaited toggles would race and revert each other */}
                  <input type="checkbox" checked={tk.done} disabled={busy} aria-label={tk.title}
                    onChange={() => patch({ op: 'toggleTask', taskId: tk.id })} />
                  <div style={{ flex: 1 }}>
                    <div className="task-title">{tk.title}</div>
                    {tk.due && <div className={`task-due${over ? ' over' : ''}`}>Due {fmtDay(tk.due)}{over ? ' · overdue' : ''}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <input
              className="crm-input"
              placeholder="New task…"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <label className="crm-label" htmlFor="task-due">Due date (optional)</label>
            <input
              id="task-due"
              className="crm-input"
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <button
              className="crm-btn gold sm"
              disabled={busy || !taskTitle.trim()}
              onClick={async () => {
                await patch({ op: 'addTask', title: taskTitle, due: taskDue ? new Date(taskDue).toISOString() : undefined });
                setTaskTitle(''); setTaskDue('');
              }}
            >
              Add task
            </button>
          </div>
        </div>

        {/* Danger */}
        {!readOnly && (
          <div className="crm-card">
            <h3>Danger zone</h3>
            <div className="act-row">
              {lead.archived_at ? (
                <>
                  <button className="crm-btn gold sm" onClick={restore}>Restore from archive</button>
                  <button className="crm-btn danger sm" onClick={purge}
                    title="Destroys the timeline and the source attribution for good. For a genuine erasure request only.">
                    Delete permanently
                  </button>
                </>
              ) : (
                <>
                  <button className="crm-btn danger sm" onClick={() => archive(false)}>Archive lead</button>
                  <button className="crm-btn danger sm" onClick={() => archive(true)}
                    title="Archive and blocklist the contact — for private numbers that are not real leads">
                    Archive &amp; block contact
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {losing && (
        <LostReasonDialog
          leadName={lead.name || ''}
          onConfirm={confirmLost}
          onCancel={() => setLosing(false)}
        />
      )}
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd style={{ wordBreak: 'break-all' }}>{v}</dd>
    </>
  );
}

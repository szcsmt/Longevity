'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead, Score, Stage } from '@/lib/crm/types';
import {
  CURRENCIES, DECISION, FINANCING, LOST_REASONS, MOTIVATIONS, NURTURE_REASONS, OBJECTIONS,
  PURPOSES, SCORES, STAGES, TIMEFRAMES, TOUCHES, VISITS, atOrBeyond, scoreLabel,
} from '@/lib/crm/types';
import { REPLY_FLAG_DAYS, creditedClaim, isNurtured, missingQualification, waWindowOpen } from '@/lib/crm/rules';
import { fmtTHB } from '@/lib/crm/villas';
import unitCatalog from '@/lib/villas.json';
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
  iso ? new Date(iso).toLocaleString('hu-HU', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('hu-HU', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '';
/* Just the clock. The day is said once, above the group. */
const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : '';

/* Today and yesterday get their names, because that is how anybody reading a
   timeline thinks about them; further back gets the date. */
const dayLabel = (iso: string): string => {
  const day = iso.slice(0, 10);
  const at = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  if (day === at(0)) return 'Ma';
  if (day === at(-1)) return 'Tegnap';
  return new Date(iso).toLocaleDateString('hu-HU', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
};

/* The badge said "call", "stage", "document" — the CRM's own field names,
   which mean something to whoever wrote them and nothing to a salesperson
   reading their first lead. */
const KIND_LABEL: Record<string, string> = {
  created: 'új lead', note: 'jegyzet', call: 'hívás', video: 'videó', meeting: 'találkozó',
  visit: 'séta', whatsapp: 'WhatsApp', email: 'e-mail', message: 'üzenet', stage: 'fázis',
  score: 'pontszám', contact: 'adat', value: 'összeg', assigned: 'kiosztás', document: 'dokumentum',
  download: 'letöltés', nurture: 'félretéve', archive: 'archívum', agency: 'ügynökség',
};

/* What counts as a conversation rather than bookkeeping. */
const TALK = new Set(['note', 'call', 'video', 'meeting', 'visit', 'whatsapp', 'email', 'message']);

/* "in 2 days" / "yesterday" — a date alone makes the reader do the arithmetic,
   and the arithmetic is the whole question being asked. `today` comes from the
   server so that the server's HTML and the browser's first paint agree. */
const dueIn = (iso: string | undefined, today: string): string => {
  if (!iso) return '';
  const days = Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return ' · ma';
  if (days === 1) return ' · holnap';
  if (days === -1) return ' · tegnap volt';
  return days > 0 ? ` · ${days} nap múlva` : ` · ${-days} napja lejárt`;
};

/** Every unit on the masterplan, in block order — A1, A2, … H7. */
const UNIT_IDS: string[] = (unitCatalog as { villas: { id: string }[] }).villas.map((v) => v.id);

const digits = (s?: string) => (s || '').replace(/[^\d]/g, '');
/* A lead's email is untrusted public-form input. Only well-formed addresses
   get clickable mailto links — '?bcc=…' style header injection stays inert. */
const safeEmail = (s?: string) => (s && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(s) ? s : null);

const CONTACT_FIELDS = [
  { key: 'name', label: 'Név' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefon' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'villa', label: 'Lakás' },
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
  /* The machine's own entries are the majority of a busy lead's timeline and
     the minority of what anybody wants to read on it, so the conversation is
     what shows first and the bookkeeping is one click away. */
  const [onlyNotes, setOnlyNotes] = useState(true);
  /* How the last thing happened. A single control instead of six buttons plus
     a Save: the phone is the common case, so it is the default, and everything
     else is one choice away rather than one decision away. */
  /* Writing on WhatsApp from inside the CRM rather than from somebody's own
     handset — see the box further down for why that distinction is the whole
     point of the integration. */
  const [waOpen, setWaOpen] = useState(false);
  const [waText, setWaText] = useState('');
  const [waErr, setWaErr] = useState('');

  const [how, setHow] = useState<string>('call');
  const [missed, setMissed] = useState(false);
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
      if (!res.ok) alert(data?.error || 'A módosítást nem sikerült menteni. Próbáld újra.');
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
      if (!res.ok) { alert(data?.error || 'A regisztrációt nem sikerült rögzíteni.'); return; }
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
        'A fázisváltás a hiánnyal együtt rögzül.',
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
      ? 'Archiválod a leadet ÉS tiltod a kapcsolatot?\n\nAz előzmény megmarad és visszaállítható. A tiltás azt jelenti, hogy erről a számról vagy e-mail címről többé nem jön létre új lead.'
      : 'Archiválod ezt a leadet?\n\nEltűnik minden listából, számlálóból és riportból, és az automata levelek leállnak. Semmi nem vész el — bármikor visszaállítható.';
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
      'Nincs visszavonás, és nincs másolat a tegnap esti mentésen kívül.\n\n' +
      'Csak valódi törlési kérésre használd.',
    )) return;
    const res = await fetch(`/api/crm/leads/${lead.id}?purge=1`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || 'A törlés nem ment végbe.');
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
    if (!confirm('Beolvasztod azt az érdeklődést ebbe a leadbe?\n\nA jegyzetei, teendői és előzménye ide kerülnek, a duplikátum pedig archiválódik egy megjegyzéssel, hogy hova került. Semmi nem semmisül meg.')) return;
    await patch({ op: 'merge', otherId });
    router.refresh();
  }

  const wa = digits(lead.whatsapp || lead.phone);
  /* Meta refuses free text more than 24 hours after the customer's own last
     message. Said before somebody writes a paragraph, not after. */
  const waOpenWindow = waWindowOpen(lead);
  const attribution: [string, string | undefined][] = [
    ['Honnan', lead.source || lead.utm_source],
    ['Csatorna', lead.utm_medium],
    ['Kampány', lead.utm_campaign],
    ['Kulcsszó', lead.utm_term],
    ['Hirdetés', lead.utm_content],
    ['Belépő oldal', lead.page_url],
  ];

  const templates = messageTemplates(lead);
  const missing = missingQualification(lead);

  // One merged timeline: manual notes and automatic history, newest first.
  const timeline = [
    ...lead.notes.map((n) => ({ id: n.id, at: n.at, body: n.body, kind: 'note' as const, by: n.by })),
    ...(lead.history || []).map((h) => ({ id: h.id, at: h.at, body: h.detail, kind: h.kind, by: h.by })),
  ].sort((a, b) => b.at.localeCompare(a.at));
/* "Conversation" is anything a person said or wrote, in either direction —
   not just the notes box. A call the CRM logged belongs here; the stage move
   that call caused does not, because that is the CRM talking to itself. */
  const shownTimeline = onlyNotes ? timeline.filter((t) => TALK.has(t.kind)) : timeline;

  /* The one thing the salesperson promised. Shown at the top of the card
     rather than in a strip that vanishes on the next render. */
  const callback = lead.tasks.find((t) => !t.done && t.due);

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
            <div style={{ color: 'var(--c-hot)', fontWeight: 600 }}>Archiválva</div>
            <div className="crm-meta" style={{ marginTop: 4 }}>
              {fmtDate(lead.archived_at)}
              {lead.archived_by ? ` · ${lead.archived_by}` : ''}
              {lead.archive_reason ? ` · ${lead.archive_reason}` : ''}
              {' · '}Hidden from every list, count and report. The automated e-mails have stopped.
            </div>
          </div>
          {!readOnly && (
            <button className="crm-btn gold sm" disabled={busy} onClick={restore}>Visszaállítás</button>
          )}
        </div>
      )}
      {/* ── Left column ── */}
      <div className="stack">
        {/* Contact + quick actions */}
        <div className="crm-card">
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Kapcsolat
            {!editing && !readOnly && (
              <button className="crm-btn ghost sm" onClick={startEdit} style={{ textTransform: 'none', letterSpacing: 0 }}>
                Szerkesztés
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
                <span className="crm-label">Ország</span>
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
                <button className="crm-btn gold sm" disabled={busy} onClick={saveEdit}>Mentés</button>
                <button className="crm-btn ghost sm" onClick={() => setEditing(false)}>Mégse</button>
              </div>
            </div>
          ) : (
            <>
              <dl className="kv">
                <dt>Név</dt><dd>{lead.name || '—'}</dd>
                <dt>E-mail</dt><dd>{lead.email || '—'}</dd>
                <dt>Telefon</dt><dd>{lead.phone || '—'}</dd>
                {lead.whatsapp && <><dt>WhatsApp</dt><dd>{lead.whatsapp}</dd></>}
                <dt>Érdeklődés</dt>
                <dd>
                  {lead.form_type || '—'}
                  {lead.form_origin ? <span className="muted"> · {lead.form_origin}</span> : null}
                  {lead.villa ? <span className="muted"> · {lead.villa}</span> : null}
                </dd>
                <dt>Ország</dt>
                <dd>
                  {countryName(leadCountry(lead)) || '—'}
                  {!lead.country && derivedCountry && <span className="muted"> · from the phone number</span>}
                </dd>
                <dt>Beérkezett</dt><dd>{fmtDate(lead.submitted_at || lead.created_at)}</dd>
                <dt>Hozzájárulás</dt><dd>{lead.gdpr_consent ? 'GDPR-hozzájárulás megadva' : '—'}</dd>
              </dl>
              <div className="act-row" style={{ marginTop: 18 }}>
                {safeEmail(lead.email) && <a className="crm-btn sm" href={`mailto:${safeEmail(lead.email)}`} onClick={() => noteOutreach('email')}>✉ E-mail</a>}
                {/* Opens the composer below rather than wa.me. Handing the
                    conversation to whichever handset the browser happens to be
                    on is how the important messages stopped being visible to
                    anybody but the person who sent them. */}
                {wa && (
                  <button type="button" className="crm-btn sm" onClick={() => { setWaText(''); setWaOpen(true); }}>
                    WhatsApp
                  </button>
                )}
                {lead.phone && <a className="crm-btn sm" href={`tel:${digits(lead.phone)}`} onClick={() => noteOutreach('phone')}>Hívás</a>}
                {/* Opens the offer filled from this lead: their name, their
                    residence, the payment schedule worked out from the price.
                    Print or save as PDF from the page itself. */}
                {!readOnly && (
                  <a className="crm-btn sm" href={`/api/crm/leads/${lead.id}/offer`} target="_blank" rel="noreferrer">
                    Ajánlat
                  </a>
                )}
              </div>

              {/* One-click reply templates — open the mail/WhatsApp client prefilled */}
              {(safeEmail(lead.email) || wa) && (
                <div className="tpl-row">
                  <select className="crm-select sm" value={tpl} aria-label="Üzenet-sablon" onChange={(e) => setTpl(Number(e.target.value))}>
                    {templates.map((t, i) => <option key={t.id} value={i}>{t.label}</option>)}
                  </select>
                  {safeEmail(lead.email) && (
                    <a
                      className="crm-btn sm"
                      href={`mailto:${safeEmail(lead.email)}?subject=${encodeURIComponent(templates[tpl].subject)}&body=${encodeURIComponent(templates[tpl].body)}`}
                      onClick={() => noteOutreach('email')}
                    >
                      E-mail megírása
                    </a>
                  )}
                  {wa && (
                    <button
                      type="button"
                      className="crm-btn sm"
                      onClick={() => { setWaText(templates[tpl].body); setWaOpen(true); }}
                    >
                      WhatsApp megírása
                    </button>
                  )}
                </div>
              )}

              {/* ── Writing on WhatsApp, from here ──

                  This button used to open wa.me, which hands the conversation
                  to whichever handset the browser is on. That is how the most
                  important messages in the business — the ones right after a
                  real call — ended up somewhere the CRM could never see, and
                  left the company when the salesperson did.

                  It goes through the company number now, and lands on the
                  timeline like everything else. */}
              {wa && waOpen && (
                <div className="wa-box">
                  {!waOpenWindow && (
                    <div className="wa-warn">
                      Több mint 24 órája nem írtak nekünk WhatsAppon. A Meta szabálya szerint ilyenkor
                      szabad szöveget nem lehet küldeni — a kísérlet valószínűleg elutasításra kerül.
                      Hívd fel őket, vagy írj e-mailt.
                    </div>
                  )}
                  <textarea
                    className="crm-textarea"
                    rows={4}
                    value={waText}
                    onChange={(e) => setWaText(e.target.value)}
                    placeholder="Írd ide az üzenetet…"
                  />
                  {waErr && <div className="crm-err" style={{ marginTop: 6 }}>{waErr}</div>}
                  <div className="act-row" style={{ marginTop: 10 }}>
                    <button
                      className="crm-btn gold sm"
                      disabled={busy || !waText.trim()}
                      onClick={async () => {
                        setWaErr('');
                        const res = await fetch(`/api/crm/leads/${lead.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ op: 'whatsapp', text: waText }),
                        });
                        const data = await res.json().catch(() => null);
                        if (!res.ok || !data?.ok) {
                          setWaErr(data?.error || 'Az üzenetet nem sikerült elküldeni.');
                          return;
                        }
                        setLead(data.lead);
                        setWaText('');
                        setWaOpen(false);
                        router.refresh();
                      }}
                    >
                      Küldés a céges számról
                    </button>
                    <button className="crm-btn ghost sm" onClick={() => { setWaOpen(false); setWaErr(''); }}>
                      Mégse
                    </button>
                    <span className="crm-meta">
                      A céges WhatsApp-számról megy ki, és felkerül az előzményre.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Other enquiries from the same person */}
        {related.length > 0 && (
          <div className="crm-card">
            <h3>Ugyanez a kapcsolat · még {related.length} érdeklődés</h3>
            {related.map((r) => (
              <div key={r.id} className="related-row">
                <Link href={`/admin/leads/${r.id}`} className="crm-row" style={{ minWidth: 0, flex: 1 }}>
                  <div className="crm-name" style={{ textTransform: 'capitalize' }}>{(r.form_type || 'enquiry').replace('_', ' ')}{r.villa ? ` · ${r.villa}` : ''}</div>
                  <div className="crm-meta">{fmtDate(r.submitted_at || r.created_at)}</div>
                </Link>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span className="badge stage">{STAGES.find((s) => s.id === r.stage)?.label}</span>
                  {!readOnly && (
                    <button className="crm-btn ghost sm" disabled={busy} onClick={() => merge(r.id)} title="Jegyzetei és előzménye ide kerül, aztán törlődik">
                      Beolvasztás
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Attribution */}
        <Fold title="Honnan jött" hint={lead.source || lead.utm_source || 'ismeretlen'}>
          <dl className="kv">
            {attribution.map(([k, v]) => (
              <FragmentRow key={k} k={k} v={v} />
            ))}
          </dl>
        </Fold>

        {/* ── Who introduced this buyer ──

            The argument this panel exists to end: "we introduced that buyer to
            you in March." Before this, an introducing agency was a free-text
            word in the source field with no date on it, and the answer lived
            in somebody's inbox.

            A registration is append-only. Nothing here edits or removes a
            claim; withdrawing one leaves it on the record with the reason. */}
        <Fold title="Ki hozta" hint={claims.length > 0 ? claims[0].agencyName : 'közvetlenül jött'}>

          {claims.length === 0 && (
            <div className="crm-meta" style={{ marginBottom: 14 }}>
              Egy ügynökség sem regisztrálta ezt a vevőt. Közvetlenül jött hozzánk.
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
                    Egy korábbi igény fölé rögzítve.
                  </div>
                )}
                {c.released_at && (
                  <div className="crm-meta" style={{ marginTop: 4 }}>
                    Visszavonva {fmtDay(c.released_at)} — {c.release_reason}
                  </div>
                )}
                {admin && !c.released_at && (
                  <button
                    className="crm-btn ghost sm"
                    style={{ marginTop: 8 }}
                    disabled={busy}
                    onClick={async () => {
                      const why = window.prompt(
                        'Miért vonjuk vissza ezt a regisztrációt?\n\nAz indokkal együtt a nyilvántartásban marad — ez nem törlés.',
                      );
                      if (why && why.trim()) await patch({ op: 'releaseClaim', claimId: c.id, reason: why });
                    }}
                  >
                    Visszavonás
                  </button>
                )}
              </div>
            );
          })}

          {credited && claims.filter((c) => !c.released_at).length > 1 && (
            <div className="lost-hint" style={{ marginTop: 4 }}>
              Egynél több ügynökség tart igényt erre a vevőre. <strong>{credited.agencyName}</strong> regisztrálta
              elsőként, és a riportok is neki írják jóvá.
            </div>
          )}

          {!readOnly && agencies.length > 0 && (
            <div style={{ marginTop: claims.length ? 16 : 0 }}>
              <label className="crm-label">Ügynökség rögzítése</label>
              <select
                className="crm-select"
                value={regAgency}
                onChange={(e) => { setRegAgency(e.target.value); setRegBroker(''); }}
              >
                <option value="">Válassz ügynökséget…</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {regContacts.length > 0 && (
                <select className="crm-select" style={{ marginTop: 8 }} value={regBroker} onChange={(e) => setRegBroker(e.target.value)}>
                  <option value="">Melyik ügynök? (nem kötelező)</option>
                  {regContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button
                className="crm-btn sm"
                style={{ marginTop: 10 }}
                disabled={busy || !regAgency}
                onClick={() => registerAgency(false)}
              >
                Regisztráció rögzítése
              </button>
            </div>
          )}
          {!readOnly && agencies.length === 0 && (
            <div className="crm-meta" style={{ marginTop: 12 }}>
              Még nincs partner ügynökség felvéve. <Link href="/admin/agencies" style={{ color: 'var(--c-gold)' }}>Vegyél fel egyet</Link> előbb.
            </div>
          )}
        </Fold>

        {/* ── Qualification ──

            The four answers that decide whether somebody is a buyer, and four
            more that decide how to sell to them. All of this lived in notes
            before, where it could not be filtered, counted, or relied on by
            anything. Every field saves on change: a form with a Save button is
            a form that gets half filled and abandoned. */}
        <Fold title="Minősítés" hint={missing.length > 0 ? `hiányzik: ${missing.join(', ')}` : 'minden megvan'}>
          {/* ── Which residence ──

              This is one of the five answers "qualified" is made of, and it
              was the only one with nowhere to answer it: the fold reported
              "melyik lakás" as missing, and the field lived on the contact
              form as free text called "Villa". So the CRM asked a question
              here and took the answer somewhere else, which is why nobody
              filled it in. The list is the actual unit catalogue — 69 units —
              because a typed "B12 maybe" is not a residence the masterplan
              can hold anybody to. */}
          <div style={{ marginBottom: 14 }}>
            <label className="crm-label" htmlFor="q-villa">Melyik lakás érdekli</label>
            <select
              id="q-villa"
              className="crm-select"
              value={lead.villa || ''}
              disabled={busy}
              onChange={(e) => patch({ op: 'update', patch: { villa: e.target.value || null } })}
            >
              <option value="">— még nem tudjuk —</option>
              {/* A unit that is no longer in the catalogue still shows, or
                  editing anything else on the lead would silently drop it. */}
              {lead.villa && !UNIT_IDS.includes(lead.villa) && (
                <option value={lead.villa}>{lead.villa}</option>
              )}
              {UNIT_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>

          <div className="qual-grid">
            <div>
              <label className="crm-label" htmlFor="q-budget">Keret</label>
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
                  aria-label="A keret pénzneme"
                  onChange={(e) => qualify({ currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {([
              ['timeframe', 'Mikorra', TIMEFRAMES],
              ['purpose', 'Mire kell', PURPOSES],
              ['financing', 'Honnan a pénz', FINANCING],
              ['decision', 'Ki dönt', DECISION],
              ['visit', 'Járt-e Samuin', VISITS],
              ['motivation', 'Mi hajtja', MOTIVATIONS],
              ['objection', 'Mi tartja vissza', OBJECTIONS],
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
        </Fold>

        {/* ── What happened, and what happens next ──

            This card is the one people live in, and it was the one nobody
            could read. Three faults, and only the third was cosmetic.

            First, it offered TWO ways to record one event: a note box with a
            Save button, and beside it six buttons that logged a call. Both
            wrote to the same timeline and neither said which you were
            supposed to use. Somebody opening the CRM on their first morning
            has to decide that before they can write down a phone call, and
            there was no right answer to find — the two were the same action
            with different consequences. There is one control now. You say
            what happened and how, and press one button.

            Second, what had been AGREED was invisible. The call-back the CRM
            books lived in a strip that appeared for a moment after logging
            and was gone on the next render, so the answer to "did I promise
            him a time" was somewhere else entirely. It is the first thing on
            the card now, because it is the first thing anybody wants.

            Third, one phone call wrote two lines — the call and the stage
            move it caused — and the second was the CRM talking to itself.
            The history shows conversations by default; the bookkeeping is one
            click away for the day somebody needs it. */}
        <div className="crm-card">
          <h3>Jegyzetek és előzmény</h3>

          {/* ── What we promised ── */}
          <div className={`next-step${callback ? '' : ' empty'}`}>
            <div className="next-step-main">
              <div className="crm-meta">Következő lépés</div>
              <div className="next-step-what">
                {callback
                  ? <>{callback.title} — <b>{fmtDay(callback.due)}</b>{dueIn(callback.due, today)}</>
                  : 'Nincs betervezve semmi ehhez a leadhez.'}
              </div>
            </div>
            {!readOnly && (
              <div className="next-step-act">
                <input
                  type="date" className="crm-input" value={callback?.due?.slice(0, 10) || ''}
                  aria-label="Következő lépés dátuma"
                  onChange={(e) => e.target.value && patch({ op: 'setCallback', due: e.target.value })}
                />
                {callback && (
                  <button
                    type="button" className="crm-btn ghost sm" disabled={busy}
                    onClick={() => patch({ op: 'setCallback', due: null })}
                  >Törlés</button>
                )}
              </div>
            )}
          </div>

          {/* ── One way to write down what happened ── */}
          {!readOnly && (
            <div className="happened">
              <div className="happened-top">
                <label className="crm-label" htmlFor="how">Mi történt?</label>
                <select
                  id="how" className="crm-select" value={how} disabled={busy}
                  onChange={(e) => setHow(e.target.value)}
                >
                  {TOUCHES.filter((t) => t.key !== 'call-missed').map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                  {/* Not everything is a conversation. Kept in the same list
                      rather than as a second button, because a second button
                      is how this card got confusing in the first place. */}
                  <option value="note">Csak feljegyzés</option>
                </select>
                {how === 'call' && (
                  <label className="happened-miss">
                    <input
                      type="checkbox" checked={missed} disabled={busy}
                      onChange={(e) => setMissed(e.target.checked)}
                    />
                    nem értem el
                  </label>
                )}
              </div>
              <textarea
                className="crm-textarea"
                placeholder={how === 'note' ? 'Írd ide a feljegyzést…' : 'Írd ide, mi hangzott el…'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="act-row" style={{ marginTop: 10, alignItems: 'center' }}>
                <button
                  className="crm-btn gold"
                  disabled={busy || (how === 'note' && !note.trim())}
                  onClick={async () => {
                    if (how === 'note') {
                      await patch({ op: 'addNote', body: note });
                    } else {
                      const key = how === 'call' && missed ? 'call-missed' : how;
                      const t = TOUCHES.find((x) => x.key === key)!;
                      const due = new Date(Date.now() + t.followUpDays * 86_400_000).toISOString().slice(0, 10);
                      await patch({ op: 'logTouch', touch: key, note, callback: due });
                    }
                    setNote('');
                    setMissed(false);
                  }}
                >
                  Rögzítés
                </button>
                <span className="crm-meta">
                  {how === 'note'
                    ? 'Csak a szöveget menti — nem számít beszélgetésnek.'
                    : `Rögzíti, és ${TOUCHES.find((t) => t.key === (how === 'call' && missed ? 'call-missed' : how))?.followUpDays} nap múlvára beírja a visszahívást.`}
                </span>
              </div>
            </div>
          )}

          {/* ── What has happened so far ── */}
          <div className="tl-head">
            <span className="crm-meta">Előzmény</span>
            <span className="tl-filter">
              <button type="button" className={onlyNotes ? 'on' : ''} onClick={() => setOnlyNotes(true)}>
                Beszélgetések
              </button>
              <button type="button" className={onlyNotes ? '' : 'on'} onClick={() => setOnlyNotes(false)}>
                Minden
              </button>
            </span>
          </div>

          <ul className="timeline">
            {shownTimeline.length === 0 && (
              <div className="empty">
                {onlyNotes ? 'Még nem beszéltetek.' : 'Még nem történt semmi.'}
              </div>
            )}
            {shownTimeline.map((item, n) => {
              const dayNow = item.at.slice(0, 10);
              const dayBefore = n > 0 ? shownTimeline[n - 1].at.slice(0, 10) : '';
              return (
                <li key={item.id} className={item.kind !== 'note' ? 'auto' : undefined}>
                  {dayNow !== dayBefore && <div className="tl-day">{dayLabel(item.at)}</div>}
                  <div className="tl-line">
                    {item.kind !== 'note' && (
                      <span className="badge stage tl-badge">{KIND_LABEL[item.kind] || item.kind}</span>
                    )}
                    <span className="tl-body">{item.body}</span>
                  </div>
                  {/* Who did it, once more than one person is signed in. Entries
                      with nobody named were the CRM's own doing. */}
                  <div className="t">{fmtTime(item.at)}{item.by ? ` · ${item.by}` : ''}</div>
                </li>
              );
            })}
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
        <Fold title="Pontszámok" hint={`${fit.pct}% \u00b7 ${engagement.pct}%`}>
          <div className="score-pair">
            {[
              { label: 'Tud-e venni', s: fit },
              { label: 'Beszél-e velünk', s: engagement },
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
              Ezt még senki nem kérdezte meg: {fit.missing.join(', ').toLowerCase()}
            </div>
          )}
        </Fold>

        {/* Stage / score */}
        <div className="crm-card">
          <h3>Hol tart</h3>
          <label className="crm-label">Fázis</label>
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
          <label className="crm-label">Pontszám</label>
          <select
            className="crm-select"
            value={lead.score}
            disabled={busy}
            onChange={(e) => patch({ op: 'update', patch: { score: e.target.value as Score } })}
          >
            {SCORES.map((s) => <option key={s} value={s}>{scoreLabel(s)}</option>)}
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
                <label className="crm-label" style={{ marginTop: 16 }}>Nyelv</label>
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
              <label className="crm-label" style={{ marginTop: 16 }}>Értékesítő</label>
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
                  <option value="">Nincs kiosztva</option>
                  {lead.owner && !roster.includes(lead.owner) && <option value={lead.owner}>{lead.owner}</option>}
                  {roster.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <div className="crm-meta">{lead.owner || roster[0] || '—'}</div>
              )}
            </>
          )}
          <label className="crm-label" style={{ marginTop: 16 }}>Üzlet értéke (THB)</label>
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
        <Fold title="Válasz-időzítő" hint={lead.awaiting_reply_since ? 'válaszra várunk' : 'nem várunk válaszra'}>
          {lead.awaiting_reply_since ? (() => {
            /* Counted from the server's `today` rather than from the clock.
               Reading the clock while rendering makes the output depend on
               WHEN React happened to render — the same lead can show 2 days
               and then 3 without anything changing, and the server's HTML and
               the browser's first paint can disagree outright. */
            const days = Math.floor(
              (Date.parse(`${today}T00:00:00Z`) - Date.parse(lead.awaiting_reply_since!.slice(0, 10) + 'T00:00:00Z'))
              / 86_400_000,
            );
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
                      Két néma követés — ideje csatornát váltani: telefon vagy WhatsApp.
                    </div>
                  )}
                </div>
                <button className="crm-btn gold sm" disabled={busy} onClick={() => patch({ op: 'awaiting', on: false })}>
                  Válasz érkezett
                </button>
              </>
            );
          })() : (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Kiment egy e-mail vagy ajánlat? Indítsd el az órát — {REPLY_FLAG_DAYS} néma nap után a lead
                (és a hozzá tartozó telek a masterplanon) jelzést kap, és magától létrejön egy követési teendő.
              </div>
              <button className="crm-btn sm" disabled={busy} onClick={() => patch({ op: 'awaiting', on: true })}>
                ✉ E-mail kiment — választ várunk
              </button>
            </>
          )}
        </Fold>

        {/* ── Not now ──

            The third answer, between "closed lost" and "leave it sitting in
            Qualified going stale". In this business the six-to-eighteen-month
            wait is normal, and both of the other answers destroy something:
            one buries the lead, the other trains everybody to ignore the
            stalled flag. */}
        <Fold title="Félretéve" hint={lead.nurture_until ? fmtDay(lead.nurture_until) : 'nincs félretéve'}>
          {lead.nurture_until ? (
            <>
              <div style={{ fontWeight: 600 }}>
                {parked ? 'Félretéve eddig: ' : '⚠ Félre volt téve eddig: '}{fmtDay(lead.nurture_until)}
              </div>
              <div className="crm-meta" style={{ marginTop: 4 }}>
                {NURTURE_REASONS.find((r) => r.id === lead.nurture_reason)?.label || 'Nincs rögzített indok'}
              </div>
              <div className="crm-meta" style={{ marginTop: 8 }}>
                {parked
                  ? 'Kimarad a napi listából és az automata levelekből, és addig nem kap „elakadt" jelzést.'
                  : 'A dátum megjött — ez a lead visszakerült a napi listába.'}
              </div>
              {!readOnly && (
                <button className="crm-btn sm" style={{ marginTop: 12 }} disabled={busy}
                  onClick={() => patch({ op: 'nurture' })}>
                  Vissza a játékba most
                </button>
              )}
            </>
          ) : !readOnly ? (
            <>
              <div className="crm-meta" style={{ marginBottom: 12 }}>
                Vásárol, de még nem most? Válaszd ki, mikor térjünk vissza rá. A lead megtartja a fázisát és
                mindent, ami rajta van, csak addig nem kér figyelmet.
              </div>
              <label className="crm-label">Térjen vissza ekkor</label>
              <input
                className="crm-input"
                type="date"
                value={nurtureDate}
                min={earliest}
                onChange={(e) => setNurtureDate(e.target.value)}
              />
              <label className="crm-label" style={{ marginTop: 12 }}>Mire várunk</label>
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
                Félreteszem addig
              </button>
            </>
          ) : (
            <div className="crm-meta">Normál működés — nincs félretéve.</div>
          )}
        </Fold>

        {/* Documents — a tracked link per document, for sending by hand over
            WhatsApp or a personal e-mail. Every open lands on the timeline, so
            "did they actually read it?" stops being guesswork. */}
        <Fold title="Dokumentumok" hint={`${DOCUMENTS.length} anyag`}>
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
                    : 'Még nem nyitotta meg'}
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
                  {copied === d.id ? '✓ Link kimásolva' : 'Követett link másolása'}
                </button>
              </div>
            );
          })}
        </Fold>

        {/* Automatic sequence — what the engine has sent and what comes next,
            so the operator is never surprised by a mail going out. */}
        {(() => {
          const seq = sequenceState(lead);
          const sent = lead.outbox || [];
          return (
            <Fold title="Automatikus levélsorozat" hint={seq.active ? `${seq.sent}/${SEQUENCE_STEPS.length} kiment` : 'nem fut'}>
              {seq.active ? (
                <div style={{ marginBottom: sent.length ? 12 : 0 }}>
                  <div style={{ fontWeight: 600 }}>{seq.sent} of {SEQUENCE_STEPS.length} sent</div>
                  {seq.next && (
                    <div className="crm-meta" style={{ marginTop: 4 }}>
                      Következő: <b>{seq.next.label}</b> · {seq.next.note.toLowerCase()}
                      <br />due {fmtDay(seq.nextDate)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="crm-meta" style={{ marginBottom: sent.length ? 12 : 0 }}>
                  Nem fut — {seq.reason.toLowerCase()}.
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
            </Fold>
          );
        })()}

        {/* Tasks */}
        <div className="crm-card">
          <h3>Teendők</h3>
          <div>
            {lead.tasks.length === 0 && <div className="empty">Még nincs teendő.</div>}
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
                    {tk.due && <div className={`task-due${over ? ' over' : ''}`}>Határidő: {fmtDay(tk.due)}{over ? ' · lejárt' : ''}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <input
              className="crm-input"
              placeholder="Új teendő…"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <label className="crm-label" htmlFor="task-due">Határidő (nem kötelező)</label>
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
              Teendő hozzáadása
            </button>
          </div>
        </div>

        {/* Danger */}
        {!readOnly && (
          <Fold title="Törlés és archiválás" tone="danger">
            <div className="act-row">
              {lead.archived_at ? (
                <>
                  <button className="crm-btn gold sm" onClick={restore}>Visszaállítás az archívumból</button>
                  <button className="crm-btn danger sm" onClick={purge}
                    title="Véglegesen megsemmisíti az idővonalat és azt, honnan jött. Csak valódi törlési kérésre.">
                    Végleges törlés
                  </button>
                </>
              ) : (
                <>
                  <button className="crm-btn danger sm" onClick={() => archive(false)}>Lead archiválása</button>
                  <button className="crm-btn danger sm" onClick={() => archive(true)}
                    title="Archiválás és a kapcsolat tiltása — magánszámokhoz, amik nem valódi leadek">
                    Archiválás és tiltás
                  </button>
                </>
              )}
            </div>
          </Fold>
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

/* ── A section you can put away ──

   The lead page had fifteen cards open at once: contact, attribution, agency,
   qualification, scores, response timer, parking, documents, the mail
   sequence, tasks, danger zone. Every one of them earns its place — and all
   of them at once is a wall of text nobody reads, least of all somebody
   opening the CRM on their first morning. The salesperson looking at a lead
   is doing one of four things: seeing who this is, reading what happened,
   moving the stage, or writing down what happens next. Everything else is a
   question they ask occasionally.

   So the occasional ones fold. What matters is that a folded section still
   ANSWERS its question from the outside — "Honnan jött · Facebook", "Ki hozta
   · közvetlenül jött" — because a heading with the answer hidden behind it is
   not less to read, it is the same amount plus a click. Folded, the row is
   the answer; opened, it is the detail behind it.

   <details> rather than state: it survives without JavaScript, the browser
   handles the keyboard, and the open ones stay open while the page
   auto-refreshes underneath. */
function Fold({ title, hint, tone, children }: {
  title: string;
  hint?: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <details className={`crm-card fold${tone === 'danger' ? ' danger' : ''}`}>
      <summary>
        <span className="fold-title">{title}</span>
        {hint ? <span className="fold-hint">{hint}</span> : null}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Lead, Score, Stage } from '@/lib/crm/types';
import { LOST_REASONS, STAGES, SCORES } from '@/lib/crm/types';
import { fmtTHB } from '@/lib/crm/villas';
import { messageTemplates } from '@/lib/crm/templates';
import { SEQUENCE_STEPS, sequenceState, stepLabel } from '@/lib/crm/sequence';
import { DOCUMENTS } from '@/lib/crm/documents';
import { guessLanguage, languageLabel, languageName } from '@/lib/crm/language';
import { LostReasonDialog } from '@/components/crm/lost-reason-dialog';

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

export function LeadWorkspace({ lead: initial, related = [], roster = [], readOnly = false }: { lead: Lead; related?: Lead[]; roster?: string[]; readOnly?: boolean }) {
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

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.lead) {
        setLead(data.lead);
        // Keep the deal-value input in sync with server truth (merge can fill
        // it) — but never while the operator is mid-edit.
        if (!valueDirty) setValueDraft(data.lead.value ? String(data.lead.value) : '');
      }
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
    await patch({ op: 'update', patch: { stage } });
  }

  async function confirmLost(reasonId: string, detail: string) {
    setLosing(false);
    const label = LOST_REASONS.find((r) => r.id === reasonId)?.label || reasonId;
    await patch({ op: 'update', patch: { stage: 'lost', lost_reason: reasonId } });
    await patch({ op: 'addNote', body: `Lost: ${label}${detail ? ` — ${detail}` : ''}` });
  }

  function startEdit() {
    setDraft(Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, lead[f.key] || ''])));
    setEditing(true);
  }

  async function saveEdit() {
    const changes: Record<string, string> = {};
    for (const f of CONTACT_FIELDS) {
      if ((draft[f.key] || '') !== (lead[f.key] || '')) changes[f.key] = (draft[f.key] || '').trim();
    }
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
                <dt>Received</dt><dd>{fmtDate(lead.submitted_at || lead.created_at)}</dd>
                <dt>Consent</dt><dd>{lead.gdpr_consent ? 'GDPR consent given' : '—'}</dd>
              </dl>
              <div className="act-row" style={{ marginTop: 18 }}>
                {safeEmail(lead.email) && <a className="crm-btn sm" href={`mailto:${safeEmail(lead.email)}`}>✉ Email</a>}
                {wa && <a className="crm-btn sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                {lead.phone && <a className="crm-btn sm" href={`tel:${digits(lead.phone)}`}>Call</a>}
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
          <button
            className="crm-btn gold sm"
            disabled={busy || !note.trim()}
            onClick={async () => { await patch({ op: 'addNote', body: note }); setNote(''); }}
          >
            Add note
          </button>
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
        {/* Stage / score */}
        <div className="crm-card">
          <h3>Status</h3>
          <label className="crm-label">Stage</label>
          <select
            className="crm-select"
            value={lead.stage}
            disabled={busy}
            onChange={(e) => setStage(e.target.value as Stage)}
            style={{ marginBottom: 16 }}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
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
              {roster.length > 1 || (lead.owner && !roster.includes(lead.owner)) ? (
                <select
                  className="crm-select"
                  value={lead.owner || ''}
                  disabled={busy}
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
            const late = days >= 3;
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

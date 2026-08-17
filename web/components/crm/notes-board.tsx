'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CARD_COLORS, CARD_LABELS, type CardColor, type CardItem, type ProjectNote } from '@/lib/crm/types';
import { NOTES_REFRESH_EVENT } from '@/components/crm/google-tasks-strip';

/* The project board — a wall of cards for anything about Longevity Resort that
   isn't a lead: an idea from a phone call, a decision waiting on someone, what
   the brochure still gets wrong. Lead follow-ups live on the Tasks page and the
   two never mix.

   The board holds the notes in its own state and talks to /api/crm/notes. Ticks
   and pins apply immediately and reconcile with whatever the server returns —
   a checkbox that waits for a round trip feels broken on a phone. */

const SWATCH: Record<CardColor, string> = {
  plain:  'var(--c-panel-2)',
  gold:   'rgba(201,169,110,0.55)',
  green:  'rgba(120,178,150,0.50)',
  blue:   'rgba(111,160,181,0.50)',
  rose:   'rgba(224,119,78,0.50)',
  violet: 'rgba(150,130,200,0.50)',
};

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `tmp-${Math.random().toString(36).slice(2)}`);

/** Pinned first, then most recently touched — the same order the store uses. */
const sortNotes = (list: ProjectNote[]) =>
  [...list].sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    (b.updatedAt || b.at || '').localeCompare(a.updatedAt || a.at || ''));

async function call(method: string, body: unknown) {
  const r = await fetch('/api/crm/notes', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false })) as Promise<{ ok: boolean; note?: ProjectNote }>;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDue = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric' });

// ── Icons ──
const Icon = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PIN = 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z';
const BOX = 'M3 7h18v3H3zM5 10v10h14V10M10 14h4';
const BIN = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';

/* ── The fields shared by the composer and the editor ── */

interface Draft {
  title: string;
  body: string;
  items: CardItem[];
  color: CardColor;
  labels: string[];
  owner: string;
  due: string;
}

const emptyDraft = (): Draft => ({ title: '', body: '', items: [], color: 'plain', labels: [], owner: '', due: '' });

const toDraft = (n: ProjectNote): Draft => ({
  title: n.title || '',
  body: n.body || '',
  items: n.items ? n.items.map((i) => ({ ...i })) : [],
  color: n.color || 'plain',
  labels: n.labels || [],
  owner: n.owner || '',
  due: n.due || '',
});

function NoteFields({ draft, set, labelPool }: { draft: Draft; set: (d: Draft) => void; labelPool: string[] }) {
  const setItem = (id: string, patch: Partial<CardItem>) =>
    set({ ...draft, items: draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <>
      <input
        className="nb-title-in" placeholder="Cím" value={draft.title}
        onChange={(e) => set({ ...draft, title: e.target.value })}
      />
      <textarea
        className="nb-body-in" placeholder="Írj bármit — ötlet, döntés, ami eszedbe jut…" value={draft.body}
        onChange={(e) => set({ ...draft, body: e.target.value })}
      />

      {/* Checklist */}
      {draft.items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {draft.items.map((it) => (
            <div className="nb-edit-li" key={it.id}>
              <input
                type="checkbox" checked={it.done} aria-label={it.text || 'Tétel kész'}
                onChange={() => setItem(it.id, { done: !it.done })}
              />
              <input
                className="crm-input" type="text" value={it.text} placeholder="Tétel"
                onChange={(e) => setItem(it.id, { text: e.target.value })}
              />
              <button
                type="button" className="nb-x" aria-label="Tétel törlése"
                onClick={() => set({ ...draft, items: draft.items.filter((i) => i.id !== it.id) })}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className="nb-tools">
        <button
          type="button" className="nb-chip"
          onClick={() => set({ ...draft, items: [...draft.items, { id: uid(), text: '', done: false }] })}
        >+ Tétel</button>

        <span className="nb-dots">
          {CARD_COLORS.map((c) => (
            <button
              key={c} type="button" aria-label={`Szín: ${c}`}
              className={`nb-dot${draft.color === c ? ' on' : ''}`}
              style={{ background: SWATCH[c] }}
              onClick={() => set({ ...draft, color: c })}
            />
          ))}
        </span>
      </div>

      {/* Labels — the suggested set plus whatever the board already uses */}
      <div className="nb-row" style={{ gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: '1 1 100%' }}>
          {[...new Set([...CARD_LABELS, ...labelPool])].map((l) => (
            <button
              key={l} type="button"
              className={`nb-chip${draft.labels.includes(l) ? ' on' : ''}`}
              onClick={() => set({
                ...draft,
                labels: draft.labels.includes(l) ? draft.labels.filter((x) => x !== l) : [...draft.labels, l],
              })}
            >{l}</button>
          ))}
        </div>
      </div>

      <div className="nb-row">
        <div>
          <label className="crm-label" htmlFor={`who-${draft.color}`}>Kire vár</label>
          <input
            id={`who-${draft.color}`} className="crm-input" placeholder="pl. Máté / Claude / kivitelező"
            value={draft.owner} onChange={(e) => set({ ...draft, owner: e.target.value })}
          />
        </div>
        <div>
          <label className="crm-label" htmlFor={`due-${draft.color}`}>Határidő</label>
          <input
            id={`due-${draft.color}`} className="crm-input" type="date"
            value={draft.due.slice(0, 10)} onChange={(e) => set({ ...draft, due: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

/* ── Composer ── */

function Composer({ labelPool, onCreate }: { labelPool: string[]; onCreate: (d: Draft) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const empty = !draft.title.trim() && !draft.body.trim() && !draft.items.some((i) => i.text.trim());

  async function save() {
    if (empty) { setOpen(false); setDraft(emptyDraft()); return; }
    setBusy(true);
    try {
      await onCreate(draft);
      setDraft(emptyDraft());
      setOpen(false);
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div className="nb-composer closed">
        <button type="button" onClick={() => setOpen(true)}>Jegyzet írása…</button>
      </div>
    );
  }
  return (
    <div className="nb-composer">
      <div className="nb-open">
        <NoteFields draft={draft} set={setDraft} labelPool={labelPool} />
        <div className="nb-tools">
          <span className="grow" />
          <button type="button" className="crm-btn ghost sm" onClick={() => { setDraft(emptyDraft()); setOpen(false); }}>Mégse</button>
          <button type="button" className="crm-btn gold sm" disabled={busy} onClick={save}>Hozzáadás</button>
        </div>
      </div>
    </div>
  );
}

/* ── One card ── */

function NoteCard({ note, readOnly, onOpen, onToggleItem, onPatch, onDelete }: {
  note: ProjectNote;
  readOnly: boolean;
  onOpen: () => void;
  onToggleItem: (itemId: string) => void;
  onPatch: (patch: Partial<ProjectNote>) => void;
  onDelete: () => void;
}) {
  const items = note.items || [];
  const shown = items.slice(0, 7);
  const doneCount = items.filter((i) => i.done).length;
  const overdue = Boolean(note.due && note.due.slice(0, 10) < todayStr());
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button" tabIndex={0}
      className={`nb-card c-${note.color || 'plain'}${note.archived ? ' archived' : ''}`}
      aria-label={note.title || note.body?.slice(0, 60) || 'Jegyzet'}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      {note.title && <h4>{note.title}</h4>}
      {note.body && (
        <p className="nb-text">
          {note.body.length > 280 ? `${note.body.slice(0, 280)}…` : note.body}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="nb-list">
          {shown.map((it) => (
            <li key={it.id} className={`nb-li${it.done ? ' done' : ''}`}>
              <input
                type="checkbox" checked={it.done} disabled={readOnly}
                aria-label={it.text}
                onClick={stop}
                onChange={() => onToggleItem(it.id)}
              />
              <span>{it.text}</span>
            </li>
          ))}
          {items.length > shown.length && (
            <li className="nb-more">+{items.length - shown.length} további</li>
          )}
        </ul>
      )}
      {items.length > 0 && (
        <div className="nb-more">{doneCount}/{items.length} kész</div>
      )}

      <div className="nb-foot">
        {note.owner && <span className="nb-tag who">{note.owner}</span>}
        {note.due && <span className={`nb-tag due${overdue ? ' over' : ''}`}>{fmtDue(note.due)}</span>}
        {(note.labels || []).map((l) => <span className="nb-tag" key={l}>{l}</span>)}

        {!readOnly && (
          <span className="nb-acts" onClick={stop} role="presentation">
            <button
              type="button" className={`nb-act${note.pinned ? ' on' : ''}`}
              aria-label={note.pinned ? 'Kitűzés levétele' : 'Kitűzés'} title="Kitűzés"
              onClick={() => onPatch({ pinned: !note.pinned })}
            ><Icon d={PIN} fill={note.pinned} /></button>
            <button
              type="button" className="nb-act"
              aria-label={note.archived ? 'Vissza a falra' : 'Archiválás'} title="Archiválás"
              onClick={() => onPatch({ archived: !note.archived })}
            ><Icon d={BOX} /></button>
            <button
              type="button" className="nb-act" aria-label="Törlés" title="Törlés"
              onClick={() => { if (confirm('Törlöd ezt a jegyzetet?')) onDelete(); }}
            ><Icon d={BIN} /></button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Editor dialog ── */

function Editor({ note, labelPool, onSave, onClose }: {
  note: ProjectNote; labelPool: string[]; onSave: (d: Draft) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(note));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <>
      <button type="button" className="nb-scrim" aria-label="Bezárás" onClick={onClose} />
      <div className="nb-box" role="dialog" aria-modal="true" aria-label="Jegyzet szerkesztése">
        <NoteFields draft={draft} set={setDraft} labelPool={labelPool} />
        <div className="nb-tools">
          <span className="grow" />
          <button type="button" className="crm-btn ghost sm" onClick={onClose}>Mégse</button>
          <button
            type="button" className="crm-btn gold sm" disabled={busy}
            onClick={async () => { setBusy(true); try { await onSave(draft); } finally { setBusy(false); } }}
          >Mentés</button>
        </div>
      </div>
    </>
  );
}

/* ── The board ── */

export function NotesBoard({ initial, readOnly }: { initial: ProjectNote[]; readOnly: boolean }) {
  const [notes, setNotes] = useState<ProjectNote[]>(() => sortNotes(initial));
  const [q, setQ] = useState('');
  const [label, setLabel] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<ProjectNote | null>(null);

  // The Google Tasks sync can archive cards behind our back (something was
  // ticked on the phone). It fires this event when it finishes; re-read rather
  // than guess what changed.
  useEffect(() => {
    const reload = async () => {
      const r = await fetch('/api/crm/notes').then((x) => x.json()).catch(() => null);
      if (r?.ok) setNotes(sortNotes(r.notes));
    };
    window.addEventListener(NOTES_REFRESH_EVENT, reload);
    return () => window.removeEventListener(NOTES_REFRESH_EVENT, reload);
  }, []);

  const replace = useCallback((note: ProjectNote) => {
    setNotes((list) => sortNotes(list.map((n) => (n.id === note.id ? note : n))));
  }, []);

  const labelPool = useMemo(
    () => [...new Set(notes.flatMap((n) => n.labels || []))].sort(),
    [notes],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes.filter((n) => {
      if (Boolean(n.archived) !== archived) return false;
      if (label && !(n.labels || []).includes(label)) return false;
      if (!needle) return true;
      const hay = [n.title, n.body, n.owner, ...(n.labels || []), ...(n.items || []).map((i) => i.text)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [notes, q, label, archived]);

  const draftToInput = (d: Draft) => ({
    title: d.title.trim(),
    body: d.body.trim(),
    items: d.items.filter((i) => i.text.trim()),
    color: d.color,
    labels: d.labels,
    owner: d.owner.trim(),
    due: d.due,
  });

  async function create(d: Draft) {
    const res = await call('POST', draftToInput(d));
    if (res.ok && res.note) setNotes((list) => sortNotes([res.note!, ...list]));
  }

  async function patch(id: string, patchBody: Partial<ProjectNote>) {
    // Applied at once — the card must respond to the tap, not to the network.
    setNotes((list) => sortNotes(list.map((n) => (n.id === id ? { ...n, ...patchBody } : n))));
    const res = await call('PATCH', { id, ...patchBody });
    if (res.ok && res.note) replace(res.note);
  }

  async function toggleItem(id: string, itemId: string) {
    setNotes((list) => list.map((n) => (n.id === id
      ? { ...n, items: (n.items || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }
      : n)));
    const res = await call('PATCH', { id, op: 'toggleItem', itemId });
    if (res.ok && res.note) replace(res.note);
  }

  async function remove(id: string) {
    setNotes((list) => list.filter((n) => n.id !== id));
    await call('DELETE', { id });
  }

  const openCount = notes.filter((n) => !n.archived).length;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Jegyzetek</h1>
          <p className="crm-sub">
            {openCount} kártya a projektről — ötletek, döntések, teendők. Ami egy ügyfélhez tartozik,
            az a Follow-ups oldalon van.
          </p>
        </div>
      </div>

      <div className="nb-bar">
        <input
          className="crm-input nb-search" placeholder="Keresés a jegyzetek közt…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Keresés"
        />
        <button type="button" className={`nb-chip${label === null ? ' on' : ''}`} onClick={() => setLabel(null)}>Mind</button>
        {labelPool.map((l) => (
          <button key={l} type="button" className={`nb-chip${label === l ? ' on' : ''}`}
            onClick={() => setLabel(label === l ? null : l)}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className={`nb-chip${archived ? ' on' : ''}`} onClick={() => setArchived(!archived)}>
          {archived ? 'Vissza a falra' : 'Archívum'}
        </button>
      </div>

      {!readOnly && !archived && <Composer labelPool={labelPool} onCreate={create} />}

      {visible.length === 0 ? (
        <div className="crm-card"><div className="empty">
          {archived ? 'Az archívum üres.' : q || label ? 'Nincs találat.' : 'Még nincs jegyzet — írd meg az elsőt fent.'}
        </div></div>
      ) : (
        <div className="nb-wall">
          {visible.map((n) => (
            <NoteCard
              key={n.id} note={n} readOnly={readOnly}
              onOpen={() => !readOnly && setEditing(n)}
              onToggleItem={(itemId) => toggleItem(n.id, itemId)}
              onPatch={(p) => patch(n.id, p)}
              onDelete={() => remove(n.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <Editor
          note={editing} labelPool={labelPool}
          onClose={() => setEditing(null)}
          onSave={async (d) => { await patch(editing.id, draftToInput(d) as Partial<ProjectNote>); setEditing(null); }}
        />
      )}
    </>
  );
}

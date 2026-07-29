import { randomUUID } from 'node:crypto';
import type { CrmEvent, Lead, LeadPatch, Note, Stage, Task } from './types';
import { scoreFor } from './scoring';
import { hasDatabase, type Backend } from './backend';
import { fileBackend } from './backend-file';

/* Domain layer of the CRM store. Persistence is pluggable: with a DATABASE_URL
   (production / Vercel + Neon) it uses Postgres; otherwise a local JSON file
   (dev). Starts EMPTY — only real form submissions and real site clicks land
   here. All CRM code talks to these functions only. */

let cached: Backend | null = null;
async function backend(): Promise<Backend> {
  if (cached) return cached;
  if (hasDatabase()) {
    const { pgBackend } = await import('./backend-pg');
    cached = pgBackend;
  } else {
    cached = fileBackend;
  }
  return cached;
}

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// ── Lead queries ──

export interface LeadFilter {
  stage?: Stage;
  score?: string;
  form_type?: string;
  source?: string;
  q?: string;
}

export async function listLeads(filter: LeadFilter = {}): Promise<Lead[]> {
  const leads = await (await backend()).allLeads();
  const q = filter.q?.trim().toLowerCase();
  return leads
    .filter((l) => {
      if (filter.stage && l.stage !== filter.stage) return false;
      if (filter.score && l.score !== filter.score) return false;
      if (filter.form_type && l.form_type !== filter.form_type) return false;
      if (filter.source && (l.source || l.utm_source || '') !== filter.source) return false;
      if (q) {
        const hay = `${l.name || ''} ${l.email || ''} ${l.phone || ''} ${l.villa || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function getLead(id: string): Promise<Lead | null> {
  return (await backend()).getLead(id);
}

// ── Lead mutations ──

export async function createLeadFromPayload(p: Record<string, unknown>): Promise<Lead> {
  // Cap every incoming string — same defensive posture as addEvent.
  const s = (k: string) =>
    typeof p[k] === 'string' ? (p[k] as string).slice(0, 300) : undefined;
  const lead: Lead = {
    id: randomUUID(),
    name: s('name'),
    email: s('email'),
    phone: s('phone'),
    whatsapp: s('whatsapp'),
    form_type: s('form_type'),
    form_origin: s('form_origin'),
    villa: s('villa'),
    gdpr_consent: p['gdpr_consent'] === true,
    utm_source: s('utm_source'),
    utm_medium: s('utm_medium'),
    utm_campaign: s('utm_campaign'),
    utm_term: s('utm_term'),
    utm_content: s('utm_content'),
    source: s('source'),
    page_url: s('page_url'),
    submitted_at: s('submitted_at') || now(),
    stage: 'new',
    score: scoreFor(s('form_type'), s('form_origin')),
    notes: [],
    tasks: [],
    created_at: now(),
    updated_at: now(),
  };
  await (await backend()).insertLead(lead);
  return lead;
}

async function mutate(id: string, fn: (lead: Lead) => void): Promise<Lead | null> {
  const be = await backend();
  const lead = await be.getLead(id);
  if (!lead) return null;
  fn(lead);
  lead.updated_at = now();
  await be.saveLead(lead);
  return lead;
}

export async function updateLead(id: string, patch: LeadPatch): Promise<Lead | null> {
  return mutate(id, (lead) => Object.assign(lead, patch));
}

export async function addNote(id: string, body: string): Promise<Lead | null> {
  const note: Note = { id: randomUUID(), body: body.trim(), at: now() };
  return mutate(id, (lead) => lead.notes.unshift(note));
}

export async function addTask(id: string, title: string, due?: string): Promise<Lead | null> {
  const task: Task = { id: randomUUID(), title: title.trim(), due, done: false, at: now() };
  return mutate(id, (lead) => lead.tasks.push(task));
}

export async function toggleTask(id: string, taskId: string): Promise<Lead | null> {
  let found = false;
  const lead = await mutate(id, (l) => {
    const task = l.tasks.find((t) => t.id === taskId);
    if (task) {
      task.done = !task.done;
      found = true;
    }
  });
  return found ? lead : null;
}

export async function deleteLead(id: string): Promise<boolean> {
  return (await backend()).removeLead(id);
}

// ── Interaction events ──

export async function addEvent(e: Omit<CrmEvent, 'id' | 'at'>): Promise<CrmEvent> {
  const ev: CrmEvent = {
    id: randomUUID(),
    type: (e.type || 'click').slice(0, 40),
    label: (e.label || '').slice(0, 120),
    path: e.path?.slice(0, 200),
    source: e.source?.slice(0, 80),
    at: now(),
  };
  await (await backend()).insertEvent(ev);
  return ev;
}

export async function listEvents(limit = 40): Promise<CrmEvent[]> {
  return (await backend()).allEvents(limit);
}

// ── Reporting ──

export interface Stats {
  total: number;
  openTasks: number;
  byStage: Record<string, number>;
  byScore: Record<string, number>;
  bySource: { source: string; count: number }[];
  byForm: Record<string, number>;
  last7: number;
  events24h: number;
  visits24h: number;
  visits7d: number;
  visitsBySource: { source: string; count: number }[];
}

export async function stats(): Promise<Stats> {
  const be = await backend();
  const [leads, events] = await Promise.all([be.allLeads(), be.allEvents(500)]);
  const byStage: Record<string, number> = {};
  const byScore: Record<string, number> = {};
  const byForm: Record<string, number> = {};
  const srcMap: Record<string, number> = {};
  let openTasks = 0;
  const weekAgo = daysAgo(7);
  const dayAgo = daysAgo(1);
  let last7 = 0;

  for (const l of leads) {
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    byScore[l.score] = (byScore[l.score] || 0) + 1;
    if (l.form_type) byForm[l.form_type] = (byForm[l.form_type] || 0) + 1;
    const src = l.source || l.utm_source || 'direct';
    srcMap[src] = (srcMap[src] || 0) + 1;
    openTasks += l.tasks.filter((t) => !t.done).length;
    if ((l.created_at || '') >= weekAgo) last7 += 1;
  }

  const bySource = Object.entries(srcMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const clicks = events.filter((e) => e.type !== 'visit');
  const visits = events.filter((e) => e.type === 'visit');
  const events24h = clicks.filter((e) => e.at >= dayAgo).length;
  const visits24h = visits.filter((e) => e.at >= dayAgo).length;
  const visits7d = visits.filter((e) => e.at >= weekAgo).length;

  // Where visitors come from: prefer the campaign source (?source=/utm) when
  // present, else the referrer host captured in the visit label.
  const vSrc: Record<string, number> = {};
  for (const v of visits.filter((e) => e.at >= weekAgo)) {
    const src = v.source || v.label || 'direct';
    vSrc[src] = (vSrc[src] || 0) + 1;
  }
  const visitsBySource = Object.entries(vSrc)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: leads.length, openTasks, byStage, byScore, bySource, byForm, last7,
    events24h, visits24h, visits7d, visitsBySource,
  };
}

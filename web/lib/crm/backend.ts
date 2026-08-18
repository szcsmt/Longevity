import type { Agency, CrmEvent, Lead, ProjectNote, VillaRecord, VillaHistoryEntry } from './types';

/* Minimal persistence contract the domain layer (store.ts) runs on. Two
   implementations: backend-file (local dev, JSON on disk) and backend-pg
   (production, Neon Postgres over HTTP). Picked automatically by env. */
export interface Backend {
  allLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  insertLead(lead: Lead): Promise<void>;
  /** Persist `lead` only if the stored revision still equals `expectedRev`
      (0 covers legacy rows without a rev). Returns false on a lost race —
      the caller re-reads and retries. */
  saveLead(lead: Lead, expectedRev: number): Promise<boolean>;
  removeLead(id: string): Promise<boolean>;
  allEvents(limit: number): Promise<CrmEvent[]>;
  insertEvent(ev: CrmEvent): Promise<void>;
  /** The WhatsApp tap carrying this reference code, no older than `since`
      (ISO). Its own query rather than a scan of allEvents: a tap has to stay
      findable however many visits were logged after it. */
  findEventByRef(ref: string, since: string): Promise<CrmEvent | null>;
  getVillas(): Promise<Record<string, VillaRecord>>;
  /** Persist (or, with `rec === null`, delete) a unit only if the stored
      revision still equals `expectedRev` (0 covers rows written before the
      revision existed, and a unit that has no row yet). Returns false on a
      lost race — the caller re-reads and redoes the change. This is what
      stops two people reserving the same villa at the same moment. */
  setVilla(id: string, rec: VillaRecord | null, expectedRev: number): Promise<boolean>;
  getVillaHistory(limit: number): Promise<VillaHistoryEntry[]>;
  addVillaHistory(entry: VillaHistoryEntry): Promise<void>;
  /** Blocked contact keys ("e:<email>" / "p:<phone-key>") — inbound WhatsApp
      from these never creates a lead again. */
  getBlocklist(): Promise<string[]>;
  addToBlocklist(keys: string[]): Promise<void>;
  /** Project notes, newest first. Whole-document writes: a note is small and
      only ever edited by one person at a time, so there is no revision dance. */
  /** Small key-value corner for integration state (tokens, sync marks). Kept
      out of the note documents: it is machinery, not content. */
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;
  allNotes(): Promise<ProjectNote[]>;
  saveNote(note: ProjectNote): Promise<void>;
  removeNote(id: string): Promise<boolean>;
  /** Partner agencies, with their named contacts nested. Whole-document
      writes, like notes: an agency record is small, edited rarely, and by one
      admin at a time — there is no race here worth a revision dance. There is
      deliberately no remove: an agency is archived, because its registrations
      are evidence about who introduced which buyer. */
  allAgencies(): Promise<Agency[]>;
  saveAgency(agency: Agency): Promise<void>;
}

/* ── The one place the backend is chosen ──

   With a DATABASE_URL (production / Vercel + Neon) it is Postgres; otherwise a
   local JSON file (dev and the whole test suite). Cached after the first call.
   Lives here rather than inside store.ts so that a second aggregate — the
   partner agencies — can reach it without importing the lead store. */
let cached: Backend | null = null;

export async function getBackend(): Promise<Backend> {
  if (cached) return cached;
  if (hasDatabase()) {
    const { pgBackend } = await import('./backend-pg');
    cached = pgBackend;
  } else {
    const { fileBackend } = await import('./backend-file');
    cached = fileBackend;
  }
  return cached;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

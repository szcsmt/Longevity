import type { CrmEvent, Lead, ProjectNote, VillaRecord, VillaHistoryEntry } from './types';

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
  setVilla(id: string, rec: VillaRecord | null): Promise<void>;
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
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

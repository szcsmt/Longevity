import type { CrmEvent, Lead, VillaRecord, VillaHistoryEntry } from './types';

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
  getVillas(): Promise<Record<string, VillaRecord>>;
  setVilla(id: string, rec: VillaRecord | null): Promise<void>;
  getVillaHistory(limit: number): Promise<VillaHistoryEntry[]>;
  addVillaHistory(entry: VillaHistoryEntry): Promise<void>;
  /** Blocked contact keys ("e:<email>" / "p:<phone-key>") — inbound WhatsApp
      from these never creates a lead again. */
  getBlocklist(): Promise<string[]>;
  addToBlocklist(keys: string[]): Promise<void>;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

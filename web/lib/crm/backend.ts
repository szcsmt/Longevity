import type { CrmEvent, Lead } from './types';

/* Minimal persistence contract the domain layer (store.ts) runs on. Two
   implementations: backend-file (local dev, JSON on disk) and backend-pg
   (production, Neon Postgres over HTTP). Picked automatically by env. */
export interface Backend {
  allLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  insertLead(lead: Lead): Promise<void>;
  saveLead(lead: Lead): Promise<void>;
  removeLead(id: string): Promise<boolean>;
  allEvents(limit: number): Promise<CrmEvent[]>;
  insertEvent(ev: CrmEvent): Promise<void>;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

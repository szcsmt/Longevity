import { neon } from '@neondatabase/serverless';
import type { CrmEvent, Lead, VillaRecord, VillaHistoryEntry } from './types';
import type { Backend } from './backend';

/* Production backend: Neon Postgres over HTTP (serverless-friendly, no pooling
   needed). Leads and events are stored as JSONB documents keyed by id — the
   domain layer does its filtering in JS, which is more than fine at a resort's
   lead volume, and keeps this backend a drop-in twin of the file one. */

function sql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

let ready: Promise<void> | null = null;
function init(): Promise<void> {
  if (!ready) {
    const q = sql();
    ready = (async () => {
      await q`CREATE TABLE IF NOT EXISTS crm_leads (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS crm_events (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS crm_villas (
        id text PRIMARY KEY,
        status text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`ALTER TABLE crm_villas ADD COLUMN IF NOT EXISTS data jsonb`;
      await q`CREATE TABLE IF NOT EXISTS crm_villa_history (
        id text PRIMARY KEY,
        entry jsonb NOT NULL,
        at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS crm_blocklist (
        key text PRIMARY KEY,
        added_at timestamptz NOT NULL DEFAULT now()
      )`;
    })().catch((e) => {
      ready = null; // allow retry on next call
      throw e;
    });
  }
  return ready;
}

export const pgBackend: Backend = {
  async allLeads() {
    await init();
    const rows = await sql()`SELECT data FROM crm_leads ORDER BY created_at DESC`;
    return rows.map((r) => r.data as Lead);
  },
  async getLead(id) {
    await init();
    const rows = await sql()`SELECT data FROM crm_leads WHERE id = ${id}`;
    return (rows[0]?.data as Lead) || null;
  },
  async insertLead(lead) {
    await init();
    await sql()`INSERT INTO crm_leads (id, data, created_at)
      VALUES (${lead.id}, ${JSON.stringify(lead)}::jsonb, ${lead.created_at})
      ON CONFLICT (id) DO NOTHING`;
  },
  async saveLead(lead, expectedRev) {
    await init();
    // Conditional update: only wins if the stored rev is still what we read
    // (legacy rows without a rev count as 0). A lost race returns false and
    // the domain layer re-reads and retries — no silent overwrite.
    const rows = await sql()`UPDATE crm_leads SET data = ${JSON.stringify(lead)}::jsonb
      WHERE id = ${lead.id}
        AND COALESCE((data->>'rev')::int, 0) = ${expectedRev}
      RETURNING id`;
    return rows.length > 0;
  },
  async removeLead(id) {
    await init();
    const rows = await sql()`DELETE FROM crm_leads WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  },
  async allEvents(limit) {
    await init();
    const rows = await sql()`SELECT data FROM crm_events ORDER BY at DESC LIMIT ${limit}`;
    return rows.map((r) => r.data as CrmEvent);
  },
  async insertEvent(ev) {
    await init();
    await sql()`INSERT INTO crm_events (id, data, at)
      VALUES (${ev.id}, ${JSON.stringify(ev)}::jsonb, ${ev.at})
      ON CONFLICT (id) DO NOTHING`;
    // Never drop actionable signals (WhatsApp / phone / email / brochure / form
    // opens / clicks). Only the high-volume anonymous "visit" log is bounded.
    await sql()`DELETE FROM crm_events WHERE data->>'type' = 'visit' AND id IN (
      SELECT id FROM crm_events WHERE data->>'type' = 'visit' ORDER BY at DESC OFFSET 5000
    )`;
  },
  async getVillas() {
    await init();
    const rows = await sql()`SELECT id, status, data FROM crm_villas`;
    const m: Record<string, VillaRecord> = {};
    for (const r of rows) {
      m[r.id as string] = (r.data as VillaRecord) || { status: r.status as VillaRecord['status'], updatedAt: '' };
    }
    return m;
  },
  async setVilla(id, rec) {
    await init();
    // null deletes; a record is stored as-is — the domain layer already
    // decided whether a free villa still carries sale data worth keeping.
    if (!rec) {
      await sql()`DELETE FROM crm_villas WHERE id = ${id}`;
    } else {
      await sql()`INSERT INTO crm_villas (id, status, data, updated_at)
        VALUES (${id}, ${rec.status}, ${JSON.stringify(rec)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET status = ${rec.status}, data = ${JSON.stringify(rec)}::jsonb, updated_at = now()`;
    }
  },
  async getVillaHistory(limit) {
    await init();
    const rows = await sql()`SELECT entry FROM crm_villa_history ORDER BY at DESC LIMIT ${limit}`;
    return rows.map((r) => r.entry as VillaHistoryEntry);
  },
  async addVillaHistory(entry) {
    await init();
    await sql()`INSERT INTO crm_villa_history (id, entry, at)
      VALUES (${entry.id}, ${JSON.stringify(entry)}::jsonb, ${entry.at})
      ON CONFLICT (id) DO NOTHING`;
  },
  async getBlocklist() {
    await init();
    const rows = await sql()`SELECT key FROM crm_blocklist`;
    return rows.map((r) => r.key as string);
  },
  async addToBlocklist(keys) {
    await init();
    for (const key of keys) {
      await sql()`INSERT INTO crm_blocklist (key) VALUES (${key}) ON CONFLICT (key) DO NOTHING`;
    }
  },
};

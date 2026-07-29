import { neon } from '@neondatabase/serverless';
import type { CrmEvent, Lead } from './types';
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
  async saveLead(lead) {
    await init();
    await sql()`UPDATE crm_leads SET data = ${JSON.stringify(lead)}::jsonb WHERE id = ${lead.id}`;
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
    // Keep the log bounded — trim anything beyond the newest 500.
    await sql()`DELETE FROM crm_events WHERE id IN (
      SELECT id FROM crm_events ORDER BY at DESC OFFSET 500
    )`;
  },
};

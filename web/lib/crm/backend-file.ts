import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { CrmEvent, Lead } from './types';
import type { Backend } from './backend';

/* Local-dev backend: one JSON file outside the project (default
   ~/.longevity-crm/db.json) with atomic writes. Not used in production —
   serverless filesystems are ephemeral; there the pg backend is active. */

const DATA_DIR = process.env.CRM_DATA_DIR || path.join(os.homedir(), '.longevity-crm');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DB { leads: Lead[]; events: CrmEvent[] }

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(raw) as Partial<DB>;
    return {
      leads: Array.isArray(db.leads) ? db.leads : [],
      events: Array.isArray(db.events) ? db.events : [],
    };
  } catch {
    return { leads: [], events: [] };
  }
}

async function write(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.' + randomUUID() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE); // atomic replace
}

export const fileBackend: Backend = {
  async allLeads() {
    return (await read()).leads;
  },
  async getLead(id) {
    return (await read()).leads.find((l) => l.id === id) || null;
  },
  async insertLead(lead) {
    const db = await read();
    db.leads.push(lead);
    await write(db);
  },
  async saveLead(lead) {
    const db = await read();
    const i = db.leads.findIndex((l) => l.id === lead.id);
    if (i === -1) return;
    db.leads[i] = lead;
    await write(db);
  },
  async removeLead(id) {
    const db = await read();
    const n = db.leads.length;
    db.leads = db.leads.filter((l) => l.id !== id);
    if (db.leads.length === n) return false;
    await write(db);
    return true;
  },
  async allEvents(limit) {
    return (await read()).events.slice(0, limit);
  },
  async insertEvent(ev) {
    const db = await read();
    db.events.unshift(ev);
    if (db.events.length > 500) db.events.length = 500; // keep the log bounded
    await write(db);
  },
};

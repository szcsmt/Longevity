import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { CrmEvent, Lead, VillaRecord, VillaHistoryEntry } from './types';
import type { Backend } from './backend';

/* Local-dev backend: one JSON file outside the project (default
   ~/.longevity-crm/db.json) with atomic writes. Not used in production —
   serverless filesystems are ephemeral; there the pg backend is active. */

const DATA_DIR = process.env.CRM_DATA_DIR || path.join(os.homedir(), '.longevity-crm');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DB {
  leads: Lead[];
  events: CrmEvent[];
  villas: Record<string, VillaRecord>;
  villaHistory: VillaHistoryEntry[];
  blocklist: string[];
}

/* All mutations are serialized through this promise chain. Without it, two
   overlapping read-modify-write cycles (a form submit racing a site-click
   event, say) both start from the same snapshot and the loser's records are
   wiped wholesale on the final write. */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(raw) as Partial<DB>;
    return {
      leads: Array.isArray(db.leads) ? db.leads : [],
      events: Array.isArray(db.events) ? db.events : [],
      villas: db.villas && typeof db.villas === 'object' ? (db.villas as Record<string, VillaRecord>) : {},
      villaHistory: Array.isArray(db.villaHistory) ? db.villaHistory : [],
      blocklist: Array.isArray(db.blocklist) ? db.blocklist : [],
    };
  } catch {
    return { leads: [], events: [], villas: {}, villaHistory: [], blocklist: [] };
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
    await locked(async () => {
      const db = await read();
      db.leads.push(lead);
      await write(db);
    });
  },
  async saveLead(lead, expectedRev) {
    return locked(async () => {
      const db = await read();
      const i = db.leads.findIndex((l) => l.id === lead.id);
      if (i === -1) return false;
      if ((db.leads[i].rev || 0) !== expectedRev) return false; // lost the race
      db.leads[i] = lead;
      await write(db);
      return true;
    });
  },
  async removeLead(id) {
    return locked(async () => {
      const db = await read();
      const n = db.leads.length;
      db.leads = db.leads.filter((l) => l.id !== id);
      if (db.leads.length === n) return false;
      await write(db);
      return true;
    });
  },
  async allEvents(limit) {
    return (await read()).events.slice(0, limit);
  },
  async insertEvent(ev) {
    await locked(async () => {
      const db = await read();
      db.events.unshift(ev);
      // Never drop actionable signals; only cap the high-volume "visit" log.
      const visits = db.events.filter((e) => e.type === 'visit');
      if (visits.length > 5000) {
        const keep = new Set(visits.slice(0, 5000).map((v) => v.id));
        db.events = db.events.filter((e) => e.type !== 'visit' || keep.has(e.id));
      }
      await write(db);
    });
  },
  async getVillas() {
    return (await read()).villas;
  },
  async setVilla(id, rec) {
    await locked(async () => {
      const db = await read();
      // The domain layer decides what a deletable record is (a free villa may
      // still carry sale-prep data) — here null means delete, nothing else.
      if (!rec) delete db.villas[id];
      else db.villas[id] = rec;
      await write(db);
    });
  },
  async getVillaHistory(limit) {
    return (await read()).villaHistory.slice(0, limit);
  },
  async addVillaHistory(entry) {
    await locked(async () => {
      const db = await read();
      db.villaHistory.unshift(entry);
      if (db.villaHistory.length > 3000) db.villaHistory.length = 3000;
      await write(db);
    });
  },
  async getBlocklist() {
    return (await read()).blocklist;
  },
  async addToBlocklist(keys) {
    await locked(async () => {
      const db = await read();
      db.blocklist = [...new Set([...db.blocklist, ...keys])];
      await write(db);
    });
  },
};

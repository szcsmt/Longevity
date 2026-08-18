import type { Lead } from './types';
import { isOpenStage } from './types';

/* The sales team, configured in env so it changes without a code edit:

     CRM_AGENTS="Máté Szűcs|sales@longevitysamui.com|+66 12 345 6789|hu,en;María|maria@…||es,en"
                 name      | e-mail (optional)     | phone (optional)  | languages (optional)

   Languages are ISO codes, comma-separated, most fluent first. They are what
   lets a Spanish-speaking enquirer reach a Spanish-speaking salesperson — see
   pickOwner below. Leave the field off and the agent is treated as taking any
   language.

   Agents are who leads get assigned to, and whose name/phone signs the
   automated customer e-mails. With no roster configured, the single
   CRM_AGENT_NAME/TITLE/PHONE fallback is used as a one-person team. */

export interface Agent {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  languages?: string[];  // ISO 639-1, most fluent first
}

const langList = (s?: string): string[] | undefined => {
  const codes = (s || '')
    .split(',')
    .map((x) => x.trim().slice(0, 2).toLowerCase())
    .filter(Boolean);
  return codes.length ? codes : undefined;
};

export function agents(): Agent[] {
  const raw = (process.env.CRM_AGENTS || '').trim();
  if (raw) {
    return raw
      .split(';')
      .map((entry) => {
        const [name, email, phone, langs] = entry.split('|').map((s) => s.trim());
        return name ? { name, email: email || undefined, phone: phone || undefined,
                        languages: langList(langs),
                        title: process.env.CRM_AGENT_TITLE || undefined } : null;
      })
      .filter(Boolean) as Agent[];
  }
  const solo = process.env.CRM_AGENT_NAME;
  return solo
    ? [{
        name: solo,
        email: process.env.CRM_NOTIFY_TO || undefined,
        phone: process.env.CRM_AGENT_PHONE || undefined,
        title: process.env.CRM_AGENT_TITLE || undefined,
        languages: langList(process.env.CRM_AGENT_LANGUAGES),
      }]
    : [];
}

/** Agents who can hold a conversation in this language. */
export function agentsSpeaking(language: string): Agent[] {
  return agents().filter((a) => !a.languages || a.languages.includes(language));
}

export function agentByName(name?: string): Agent | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return agents().find((a) => a.name.trim().toLowerCase() === n);
}

/* Round-robin that self-corrects: the next lead goes to whoever currently
   carries the fewest OPEN leads (ties break on roster order). Stateless — no
   counter to drift — and it rebalances by itself when someone closes deals
   faster or joins mid-flight.

   Language comes first. Being sold to in your own language beats being sold to
   by whoever happens to be least busy, so the load balancing runs *within* the
   set of agents who speak the lead's language. If nobody speaks it, the whole
   roster is in play — a lead in the hands of someone who can't speak their
   language still beats a lead nobody owns. */
export function pickOwner(existing: Lead[], language?: string): string | undefined {
  const all = agents();
  if (!all.length) return undefined;

  const speakers = language ? agentsSpeaking(language) : all;
  const roster = speakers.length ? speakers : all;
  if (roster.length === 1) return roster[0].name;

  const load = new Map(roster.map((a) => [a.name, 0]));
  for (const l of existing) {
    if (!l.owner || !isOpenStage(l.stage)) continue;
    if (load.has(l.owner)) load.set(l.owner, (load.get(l.owner) || 0) + 1);
  }
  let best = roster[0].name;
  let bestLoad = load.get(best) ?? 0;
  for (const a of roster) {
    const n = load.get(a.name) ?? 0;
    if (n < bestLoad) { best = a.name; bestLoad = n; }
  }
  return best;
}

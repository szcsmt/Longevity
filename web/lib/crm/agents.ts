import type { Lead } from './types';

/* The sales team, configured in env so it changes without a code edit:

     CRM_AGENTS="Máté Szűcs|sales@longevitysamui.com|+66 12 345 6789;Anna K|anna@…|+66…"
                 name      | e-mail (optional)     | phone (optional)

   Agents are who leads get assigned to, and whose name/phone signs the
   automated customer e-mails. With no roster configured, the single
   CRM_AGENT_NAME/TITLE/PHONE fallback is used as a one-person team. */

export interface Agent {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
}

export function agents(): Agent[] {
  const raw = (process.env.CRM_AGENTS || '').trim();
  if (raw) {
    return raw
      .split(';')
      .map((entry) => {
        const [name, email, phone] = entry.split('|').map((s) => s.trim());
        return name ? { name, email: email || undefined, phone: phone || undefined,
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
      }]
    : [];
}

export function agentByName(name?: string): Agent | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return agents().find((a) => a.name.trim().toLowerCase() === n);
}

/* Round-robin that self-corrects: the next lead goes to whoever currently
   carries the fewest OPEN leads (ties break on roster order). Stateless — no
   counter to drift — and it rebalances by itself when someone closes deals
   faster or joins mid-flight. */
export function pickOwner(existing: Lead[]): string | undefined {
  const roster = agents();
  if (!roster.length) return undefined;
  if (roster.length === 1) return roster[0].name;

  const open = new Set(['new', 'contacted', 'qualified', 'reserved']);
  const load = new Map(roster.map((a) => [a.name, 0]));
  for (const l of existing) {
    if (!l.owner || !open.has(l.stage)) continue;
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

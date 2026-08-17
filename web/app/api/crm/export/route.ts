import { isAdmin, isAuthed } from '@/lib/crm/auth';
import { listLeads } from '@/lib/crm/store';
import type { Lead, Stage } from '@/lib/crm/types';

export const dynamic = 'force-dynamic';

/* CSV export of the (optionally filtered) lead list — same query params as the
   Leads page, so "Export CSV" downloads exactly the view being looked at. */

const COLS: [string, (l: Lead) => string | number | undefined][] = [
  ['name', (l) => l.name],
  ['email', (l) => l.email],
  ['phone', (l) => l.phone],
  ['whatsapp', (l) => l.whatsapp],
  ['form_type', (l) => l.form_type],
  ['form_origin', (l) => l.form_origin],
  ['villa', (l) => l.villa],
  ['stage', (l) => l.stage],
  ['score', (l) => l.score],
  ['source', (l) => l.source || l.utm_source],
  ['utm_medium', (l) => l.utm_medium],
  ['utm_campaign', (l) => l.utm_campaign],
  ['gdpr_consent', (l) => (l.gdpr_consent ? 'yes' : 'no')],
  ['received', (l) => l.submitted_at || l.created_at],
  ['notes', (l) => l.notes.length],
  ['open_tasks', (l) => l.tasks.filter((t) => !t.done).length],
];

/* Every value in this file comes from the PUBLIC lead form, so treat it as
   hostile: quote anything containing separators (incl. a bare \r, which would
   otherwise split the row), and neutralise spreadsheet formula prefixes
   (= @ tab, and +/- unless it's just a phone-style number) so Excel/Sheets
   never evaluates an attacker's cell. */
const FORMULA_PREFIX = /^[=@\t\r]/;
const PHONEISH = /^[+-][\d\s()./-]*$/;
const cell = (v: string | number | undefined) => {
  let s = v === undefined || v === null ? '' : String(v);
  if (FORMULA_PREFIX.test(s) || (/^[+-]/.test(s) && !PHONEISH.test(s))) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.json({ ok: false }, { status: 401 });
  /* Every contact detail we hold, in one file, on someone's laptop. Hiding the
     button is not a control; refusing the request is. */
  if (!(await isAdmin())) return Response.json({ ok: false, error: 'admins only' }, { status: 403 });
  const url = new URL(req.url);
  const p = (k: string) => url.searchParams.get(k) || undefined;
  const leads = await listLeads({
    stage: p('stage') as Stage | undefined,
    score: p('score'),
    form_type: p('form_type'),
    q: p('q'),
    // Follows the view it was launched from: exporting while looking at the
    // archive should not quietly hand back the live list instead.
    archived: p('archived') === 'only' ? 'only' : undefined,
  });

  const lines = [
    COLS.map(([h]) => h).join(','),
    ...leads.map((l) => COLS.map(([, fn]) => cell(fn(l))).join(',')),
  ];

  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="longevity-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

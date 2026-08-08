import type { Lead } from './types';
import { PHASES } from './types';
import { letterIdentity } from './letters';
import { fmtTHB, villaByName } from './villas';

/* ── The reservation offer ──

   The CRM already knows the buyer's name, which residence they want and what
   it costs. Retyping all three into a Word file is how figures end up wrong in
   a document with someone's name on it, so the CRM writes the offer itself.

   Deliberately a light document, not the dark brand e-mail: this one gets
   printed, signed and scanned, and dark pages are unreadable that way. It
   opens in the browser and prints to PDF with the browser's own dialogue,
   which needs no library and no server-side renderer.

   Scope: this is an offer — the residence, the figures, the payment schedule
   and what is included. The reservation and management CONTRACTS are separate
   legal documents; once their templates are in the repo the same data can fill
   those too, and nothing here needs to change. */

const GOLD = '#9A7B3F';
const INK = '#1A1D19';
const MUTED = '#6E6A5E';
const HAIR = '#DED6C4';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A short human reference, stable for a given lead and day: LR-4F2A-0812. */
export function offerReference(l: Lead, on = new Date()): string {
  const stub = l.id.replace(/-/g, '').slice(0, 4).toUpperCase();
  const md = `${String(on.getUTCMonth() + 1).padStart(2, '0')}${String(on.getUTCDate()).padStart(2, '0')}`;
  return `LR-${stub}-${md}`;
}

export interface OfferInput {
  lead: Lead;
  /** Overrides the catalogue price — a negotiated figure, or a unit not in the
      list. Falls back to the lead's own deal value, then the list price. */
  value?: number;
  /** How long the figures stand. Fourteen days is the house default. */
  validDays?: number;
}

export function offerHtml({ lead, value, validDays = 14 }: OfferInput): string {
  const villa = villaByName(lead.villa);
  const total = value || lead.value || villa?.price || 0;
  const me = letterIdentity(lead);
  const today = new Date();
  const until = new Date(today.getTime() + validDays * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const buyer = [lead.name, lead.email, lead.phone || lead.whatsapp]
    .filter((v): v is string => Boolean(v));

  const rows = PHASES.map((p) => {
    /* Rounded per line rather than apportioned, because these are the figures
       a buyer will read on an invoice. The percentages are exact; the last
       line absorbs any rounding so the column still sums to the total. */
    const amount = Math.round((p.pct / 100) * total);
    return { ...p, amount };
  });
  const drift = total - rows.reduce((s, r) => s + r.amount, 0);
  if (rows.length && drift) rows[rows.length - 1].amount += drift;

  const detail = (k: string, v: string) => `
    <tr>
      <td style="padding:7px 24px 7px 0;color:${MUTED};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap;">${esc(k)}</td>
      <td style="padding:7px 0;font-size:15px;">${esc(v)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reservation offer ${esc(offerReference(lead, today))} — Longevity Resort</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #F4F1EA; color: ${INK};
    font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.65;
  }
  .sheet { max-width: 760px; margin: 28px auto; background: #fff; padding: 56px 56px 48px; }
  .eyebrow { font-family: Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${MUTED}; }
  h1 { font-weight: 400; font-size: 32px; line-height: 1.2; margin: 14px 0 0; }
  h2 { font-family: Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${GOLD}; margin: 38px 0 10px; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; }
  .rule { border: 0; border-top: 1px solid ${HAIR}; margin: 26px 0 0; }
  .sched td { padding: 11px 0; border-bottom: 1px solid ${HAIR}; }
  .pct { font-size: 20px; color: ${GOLD}; width: 74px; }
  .amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total td { padding-top: 16px; font-size: 18px; }
  .note { color: ${MUTED}; font-size: 13px; }
  .sign { margin-top: 46px; display: flex; gap: 40px; }
  .sign div { flex: 1; }
  .sign .line { border-bottom: 1px solid ${INK}; height: 46px; }
  .print { position: fixed; top: 16px; right: 16px; font-family: Helvetica, Arial, sans-serif; font-size: 13px;
           padding: 10px 18px; border: 1px solid ${GOLD}; color: ${GOLD}; background: #fff; border-radius: 999px; cursor: pointer; }
  @media print { .print { display: none; } body { background: #fff; } .sheet { margin: 0; padding: 0; max-width: none; } }
</style>
</head>
<body>
<button class="print" onclick="window.print()">Print or save as PDF</button>
<div class="sheet">

  <div class="eyebrow">Longevity Resort &middot; Plai Laem, Koh Samui, Thailand</div>
  <h1>Reservation offer</h1>
  <div class="note" style="margin-top:8px;">
    Reference ${esc(offerReference(lead, today))} &middot; issued ${day(today)} &middot; valid until ${day(until)}
  </div>

  <h2>Prepared for</h2>
  <div>${buyer.length ? buyer.map(esc).join('<br>') : 'Prospective buyer'}</div>

  <h2>The residence</h2>
  <table>
    ${detail('Residence', villa?.name || lead.villa || 'To be selected')}
    ${villa ? detail('Built area', villa.built) : ''}
    ${villa ? detail('Plot', villa.plot) : ''}
    ${detail('Price', total ? fmtTHB(total) : 'On application')}
    ${detail('Ownership', 'Freehold plot, managed residence')}
  </table>

  <h2>Payment schedule</h2>
  <table class="sched">
    ${rows.map((r) => `
    <tr>
      <td class="pct">${r.pct}%</td>
      <td>${esc(r.gate)}</td>
      <td class="amt">${total ? fmtTHB(r.amount) : '—'}</td>
    </tr>`).join('')}
    <tr class="total">
      <td></td>
      <td style="letter-spacing:0.14em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${MUTED};">Total</td>
      <td class="amt">${total ? fmtTHB(total) : 'On application'}</td>
    </tr>
  </table>
  <p class="note">
    Each instalment falls due when the stage it is tied to is complete on site. Nothing
    is payable in advance of the work it belongs to.
  </p>

  <h2>Included with ownership</h2>
  <ul style="margin:0;padding-left:20px;">
    <li>Full management of the residence, including letting it on the owner's behalf</li>
    <li>10% fixed annual return, contracted</li>
    <li>100% buyback guarantee</li>
    <li>Access to the longevity and diagnostics centre</li>
    <li>24/7 gated security, five minutes from the beach</li>
  </ul>

  <hr class="rule">
  <p class="note" style="margin-top:18px;">
    This offer sets out the commercial terms only and is not itself a contract. On
    acceptance, the reservation agreement and the management agreement are issued for
    signature. Figures are in Thai baht and stand until ${day(until)}.
  </p>

  <div class="sign">
    <div>
      <div class="line"></div>
      <div class="note" style="margin-top:6px;">${esc(lead.name || 'Buyer')}</div>
    </div>
    <div>
      <div class="line"></div>
      <div class="note" style="margin-top:6px;">${esc(me.name)}${me.email ? ` &middot; ${esc(me.email)}` : ''}</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

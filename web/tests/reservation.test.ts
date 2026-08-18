import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* A reservation as a process, and the contract that follows it.

   A unit flipping to `reserved` says a villa is held. It does not say by when
   the deposit has to land, what the deposit was, whether it landed, or when the
   hold lapses if it does not — which is the entire content of a reservation
   agreement. Without those four facts a hold that quietly expired looked
   exactly like a live one, and the way anybody found out was by trying to sell
   the villa to somebody else.

   Between a reservation and a sale there used to be nothing at all: a deal sat
   at "reserved" for three months whether the SPA had gone out that morning or
   was signed and sitting in a drawer. */

const dir = mkdtempSync(join(tmpdir(), 'lr-crm-resv-'));
process.env.CRM_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.SHEET_WEBHOOK;        // nothing leaves the machine
delete process.env.PARTNER_WEBHOOK_URL;
process.env.CRM_AGENTS = 'Anna|anna@example.com||en';

const store = await import('../lib/crm/store');

after(() => rmSync(dir, { recursive: true, force: true }));

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

let u = 0;
const unit = () => `R${++u}`;

/** A free unit with a named buyer linked, which is where a reservation starts. */
async function withBuyer(id: string, name = 'Buyer') {
  await store.setVillaStatus(id, 'free');
  const lead = await store.createManualLead({ name, email: `${id.toLowerCase()}@example.com` });
  await store.updateVillaSale(id, { op: 'sale', patch: { buyerLeadId: lead.id } });
  return lead;
}

const rec = async (id: string) => (await store.getVillaData()).villas[id];

describe('taking a reservation', () => {
  it('records the agreement behind it, not just the status', async () => {
    const id = unit();
    await withBuyer(id, 'Marta');
    await store.updateVillaSale(id, {
      op: 'reserve', amount: 1_400_000, expiresAt: day(30), agreement: 'RES-2026-014.pdf', by: 'Anna',
    });

    const r = (await rec(id))!;
    assert.equal(r.status, 'reserved');
    assert.equal(r.reservation!.amount, 1_400_000);
    assert.equal(r.reservation!.expires_at, day(30));
    assert.equal(r.reservation!.agreement, 'RES-2026-014.pdf');
    assert.equal(r.reservation!.by, 'Anna');
    assert.equal(r.reservation!.paid_at, undefined, 'agreeing a deposit is not receiving one');
  });

  it('is refused on a villa with no buyer on the record', async () => {
    const id = unit();
    await store.setVillaStatus(id, 'free');
    await assert.rejects(
      () => store.updateVillaSale(id, { op: 'reserve', amount: 500_000 }),
      (err: Error) => {
        assert.equal(err.name, 'VillaConflict');
        assert.match(err.message, /Link the buyer/);
        return true;
      },
    );
    /* A free unit carrying nothing is not stored at all, so "no row" and
       "row saying free" are the same answer: still on the market. */
    assert.notEqual((await rec(id))?.status, 'reserved', 'a refused reservation leaves the villa on the market');
  });

  it('puts the whole thing on the villa history, so it reads back later', async () => {
    const id = unit();
    await withBuyer(id, 'Pieter');
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_000_000, expiresAt: day(14), by: 'Anna' });

    const { history } = await store.getVillaData();
    const line = history.find((h) => h.villaId === id && h.note?.startsWith('Reserved for'))!;
    assert.match(line.note!, /Reserved for Pieter/);
    assert.match(line.note!, /deposit/);
    assert.match(line.note!, /holds to/);
  });

  it('cannot be taken on a villa somebody else already holds', async () => {
    const id = unit();
    await withBuyer(id, 'First');
    await store.updateVillaSale(id, { op: 'reserve', amount: 900_000, by: 'Anna' });
    // The double-reservation guard sits above this and is what refuses.
    await assert.rejects(() => store.setVillaStatus(id, 'reserved', { seller: 'Someone else' }));
  });
});

describe('the deposit landing', () => {
  it('is a separate fact from agreeing it, and lands on the history', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', amount: 1_400_000, by: 'Anna' });
    await store.updateVillaSale(id, { op: 'reservationPatch', patch: { paidAt: day(0) } });

    const r = (await rec(id))!;
    assert.equal(r.reservation!.paid_at, day(0));
    const { history } = await store.getVillaData();
    assert.ok(history.some((h) => h.villaId === id && /deposit received/.test(h.note || '')));
  });

  it('ignores a date that is not a date', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'reservationPatch', patch: { paidAt: 'last tuesday' } });
    assert.equal((await rec(id))!.reservation!.paid_at, undefined);
  });
});

describe('a hold that ends', () => {
  it('puts the villa back on the market and says why', async () => {
    const id = unit();
    await withBuyer(id, 'Gone Quiet');
    await store.updateVillaSale(id, { op: 'reserve', amount: 800_000, expiresAt: day(-1), by: 'Anna' });
    await store.updateVillaSale(id, { op: 'releaseReservation', reason: 'Deposit never arrived' });

    // Nothing worth keeping is left, so the row goes entirely — exactly what a
    // manual "back to free" does, and it reads as available everywhere.
    assert.notEqual((await rec(id))?.status, 'reserved');
    assert.equal((await rec(id))?.reservation, undefined);

    const { history } = await store.getVillaData();
    const line = history.find((h) => h.villaId === id && /Reservation released/.test(h.note || ''))!;
    assert.match(line.note!, /was Gone Quiet/);
    assert.match(line.note!, /Deposit never arrived/);
  });

  it('does not leave one buyer\u2019s negotiated price on a villa anybody can now buy', async () => {
    /* The leak this caught: a released hold kept `contractValue`, and the
       partner feed publishes that as the price of an AVAILABLE unit. A
       discount agreed with one buyer is not a price list. */
    const id = unit();
    await withBuyer(id, 'Discount Buyer');
    await store.updateVillaSale(id, { op: 'sale', patch: { contractValue: 9_500_000 } });
    await store.updateVillaSale(id, { op: 'reserve', amount: 500_000, by: 'Anna' });
    await store.updateVillaSale(id, { op: 'releaseReservation', reason: 'Changed their mind' });

    const r = await rec(id);
    assert.equal(r?.contractValue, undefined, 'the negotiated price goes with the deal');
    assert.equal(r?.buyerLeadId, undefined, 'and so does the buyer link');
    assert.equal(r?.buyerName, undefined);
  });

  it('lets the next buyer reserve it without a fight', async () => {
    /* Leaving the buyer link behind would have refused the next reservation
       with "already linked to …", on a villa the masterplan shows as free. */
    const id = unit();
    await withBuyer(id, 'First');
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'releaseReservation', reason: 'Lapsed' });

    const next = await store.createManualLead({ name: 'Second', email: `${id}-2@example.com` });
    await store.updateVillaSale(id, { op: 'sale', patch: { buyerLeadId: next.id } });
    await store.updateVillaSale(id, { op: 'reserve', amount: 700_000, by: 'Anna' });

    const r = (await rec(id))!;
    assert.equal(r.status, 'reserved');
    assert.equal(r.buyerName, 'Second');
  });

  it('needs a reason', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'releaseReservation', reason: '   ' });
    assert.equal((await rec(id))!.status, 'reserved', 'nothing happens without one');
  });
});

describe('watching the holds', () => {
  it('puts the lapsed ones first and counts the days', async () => {
    const late = unit();
    await withBuyer(late, 'Late');
    await store.updateVillaSale(late, { op: 'reserve', expiresAt: day(-9), by: 'Anna' });

    const soon = unit();
    await withBuyer(soon, 'Soon');
    await store.updateVillaSale(soon, { op: 'reserve', expiresAt: day(3), by: 'Anna' });

    const far = unit();
    await withBuyer(far, 'Far');
    await store.updateVillaSale(far, { op: 'reserve', expiresAt: day(60), by: 'Anna' });

    const watch = await store.reservationWatch(7);
    const seen = watch.filter((w) => [late, soon, far].includes(w.id));
    assert.equal(seen[0].id, late);
    assert.equal(seen[0].state, 'lapsed');
    assert.equal(seen[0].daysLeft, -9, 'negative days read as overdue; clamping at zero hides how bad it is');
    assert.equal(seen[1].id, soon);
    assert.equal(seen[1].state, 'due');
    assert.equal(seen.find((w) => w.id === far)!.state, 'held');
  });

  it('leaves a hold with no agreed expiry alone rather than inventing one', async () => {
    const id = unit();
    await withBuyer(id, 'Open Ended');
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });

    const w = (await store.reservationWatch()).find((x) => x.id === id)!;
    assert.equal(w.daysLeft, null);
    assert.equal(w.state, 'held');
  });

  it('drops a villa the moment its hold is released', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', expiresAt: day(-2), by: 'Anna' });
    await store.updateVillaSale(id, { op: 'releaseReservation', reason: 'Cancelled' });
    assert.equal((await store.reservationWatch()).some((w) => w.id === id), false);
  });
});

describe('the contract', () => {
  it('stamps each step the first time it is reached', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'contract', status: 'sent' });
    await store.updateVillaSale(id, { op: 'contract', status: 'review' });
    await store.updateVillaSale(id, { op: 'contract', status: 'signed', note: 'Both parties, Bangkok' });

    const c = (await rec(id))!.contract!;
    assert.equal(c.status, 'signed');
    assert.equal(c.sent_at, day(0));
    assert.equal(c.reviewed_at, day(0));
    assert.equal(c.signed_at, day(0));
    assert.equal(c.note, 'Both parties, Bangkok');
  });

  it('does not rewrite when the contract went out just because somebody stepped back', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'contract', status: 'sent' });
    const sentAt = (await rec(id))!.contract!.sent_at;

    await store.updateVillaSale(id, { op: 'contract', status: 'none' });
    await store.updateVillaSale(id, { op: 'contract', status: 'sent' });
    assert.equal((await rec(id))!.contract!.sent_at, sentAt);
  });

  it('refuses a status nobody defined', async () => {
    const id = unit();
    await withBuyer(id);
    await store.updateVillaSale(id, { op: 'reserve', by: 'Anna' });
    await store.updateVillaSale(id, { op: 'contract', status: 'nearly-there' as never });
    assert.equal((await rec(id))!.contract, undefined);
  });
});

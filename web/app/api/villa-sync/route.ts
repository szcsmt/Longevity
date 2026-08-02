/* Inbound villa-status sync from the Google Sheet (via its Apps Script).
   The Apps Script POSTs here with the shared secret when someone edits the
   STATUS / SELLER column in the sheet. We apply it silently so it does NOT push
   straight back to the sheet (no loop). */
import { setVillaStatus, type VillaStatus } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';

const MAP: Record<string, VillaStatus> = { free: 'free', sold: 'sold', reserved: 'reserved' };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!process.env.SHEET_SECRET || b.secret !== process.env.SHEET_SECRET) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const id = String(b.id || '').trim();
  const status = MAP[String(b.status || '').trim().toLowerCase()];
  if (!id || !status) return Response.json({ ok: false, error: 'bad input' }, { status: 400 });

  await setVillaStatus(
    id,
    status,
    { seller: b.seller ? String(b.seller) : undefined, note: b.note ? String(b.note) : undefined },
    { silent: true },
  );
  return Response.json({ ok: true });
}

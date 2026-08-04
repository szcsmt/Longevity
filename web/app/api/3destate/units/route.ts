import villaData from '@/lib/villas.json';
import { getVillaData } from '@/lib/crm/store';
import { VILLAS, paidTotal } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

/* Partner API for the 3DEstate Smart Model (and any future integration):
   the live state of all 69 units in one authenticated GET. The 3D twin polls
   this (or fetches on publish) and colours/prices its units accordingly.

   Auth: x-api-key header (preferred) or ?key= query param, checked against
   ESTATE_API_KEY. The key can be rotated any time by changing the env var. */

type VillaMeta = {
  id: string; block: string; n: number;
  type?: string; size?: string; area?: number; plotArea?: number;
};

/** List price by unit size (M/L/XL) from the public price list. */
function listPrice(size?: string): number | null {
  if (!size) return null;
  const v = VILLAS.find((x) => x.name === `Residence ${size}`);
  return v ? v.price : null;
}

export async function GET(req: Request) {
  const expected = process.env.ESTATE_API_KEY;
  const given = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key') || '';
  if (!expected || given !== expected) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { villas: records } = await getVillaData();
  const units = (villaData.villas as VillaMeta[]).map((v) => {
    const rec = records[v.id];
    const status = rec?.status === 'sold' ? 'sold' : rec?.status === 'reserved' ? 'reserved' : 'available';
    return {
      id: v.id,                       // e.g. "H7" — block letter + number
      block: v.block,
      number: v.n,
      status,                          // available | reserved | sold
      price: rec?.contractValue ?? listPrice(v.size), // THB; null when not priced
      currency: 'THB',
      bedrooms: v.type === '2BR' ? 2 : v.type === '1BR' ? 1 : null,
      size_type: v.size ?? null,       // M | L | XL
      area_sqm: v.area ?? null,
      plot_area_sqm: v.plotArea ?? null,
      // Reservation progress, without exposing buyer identity:
      payment_progress:
        rec?.contractValue && paidTotal(rec) > 0
          ? Math.min(100, Math.round((paidTotal(rec) / rec.contractValue) * 100))
          : null,
      updated_at: rec?.updatedAt || null,
    };
  });

  return Response.json(
    {
      ok: true,
      generated_at: new Date().toISOString(),
      total: units.length,
      counts: {
        available: units.filter((u) => u.status === 'available').length,
        reserved: units.filter((u) => u.status === 'reserved').length,
        sold: units.filter((u) => u.status === 'sold').length,
      },
      units,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

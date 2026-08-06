import villaData from '@/lib/villas.json';
import { isAdmin } from '@/lib/crm/auth';
import { getVillaData, listLeads } from '@/lib/crm/store';
import { Masterplan, type LeadOption } from '@/components/crm/masterplan';

export const dynamic = 'force-dynamic';

type Villa = {
  id: string; block: string; n: number; x: number; y: number;
  type?: string; size?: string; area?: number; plotArea?: number;
};

export default async function MasterplanPage() {
  const [{ villas: records, history }, leads, admin] = await Promise.all([getVillaData(), listLeads(), isAdmin()]);
  const villas = villaData.villas as Villa[];

  // Light projection for the buyer picker + the awaiting-reply flag on plots.
  const leadOptions: LeadOption[] = leads
    .filter((l) => l.stage !== 'lost')
    .map((l) => ({
      id: l.id,
      name: l.name || l.email || 'Unknown',
      awaitingSince: l.awaiting_reply_since || null,
    }));

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Masterplan</h1>
          <p className="crm-sub">
            Availability, buyers and the 7/43/40/10 payment schedule across all {villas.length} residences —
            click a villa to manage its sale.
          </p>
        </div>
      </div>
      <div className="crm-card" style={{ padding: 'clamp(16px,2vw,24px)' }}>
        <Masterplan image={villaData.image} villas={villas} initial={records} history={history} leads={leadOptions} readOnly={!admin} />
      </div>
    </>
  );
}

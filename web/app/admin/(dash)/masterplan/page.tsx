import villaData from '@/lib/villas.json';
import { can } from '@/lib/crm/auth';
import { getVillaData, listLeads } from '@/lib/crm/store';
import { Masterplan, type LeadOption } from '@/components/crm/masterplan';

export const dynamic = 'force-dynamic';

type Villa = {
  id: string; block: string; n: number; x: number; y: number;
  type?: string; size?: string; area?: number; plotArea?: number;
};

export default async function MasterplanPage() {
  /* Archived leads are read too, and then filtered back down. A buyer already
     linked to a unit MUST stay in the picker even if their lead was archived
     before that became impossible: otherwise the select finds no matching
     option, shows an empty box, and reads as though the buyer had been
     unlinked — a silent inconsistency on the one screen where the money is. */
  /* Two different permissions on one screen: writing the ledger is finance's
     job, changing what a buyer agreed to pay is the owner's. */
  const [{ villas: records, history }, leads, canWrite, owner] = await Promise.all([
    getVillaData(), listLeads({ archived: 'include' }), can('money.write'), can('partners.write'),
  ]);
  const villas = villaData.villas as Villa[];

  const linkedBuyers = new Set(
    Object.values(records).map((r) => r.buyerLeadId).filter(Boolean) as string[],
  );

  // Light projection for the buyer picker + the awaiting-reply flag on plots.
  const leadOptions: LeadOption[] = leads
    .filter((l) => linkedBuyers.has(l.id) || (!l.archived_at && l.stage !== 'lost'))
    .map((l) => ({
      id: l.id,
      name: `${l.name || l.email || 'Névtelen'}${l.archived_at ? ' (archived)' : ''}`,
      awaitingSince: l.awaiting_reply_since || null,
      villa: (l.villa || '').trim(),
      stage: l.stage,
    }));

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Masterplan</h1>
          <p className="crm-sub">
            Elérhetőség, vevők és a fizetési ütem mind a {villas.length} lakásra —
            kattints egy villára az eladás kezeléséhez.
          </p>
        </div>
      </div>
      <div className="crm-card" style={{ padding: 'clamp(16px,2vw,24px)' }}>
        <Masterplan image={villaData.image} villas={villas} initial={records} history={history} leads={leadOptions} readOnly={!canWrite} admin={owner} />
      </div>
    </>
  );
}

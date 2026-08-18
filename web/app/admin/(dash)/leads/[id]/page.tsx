import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEdit, isAdmin } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { getLead, relatedLeads } from '@/lib/crm/store';
import { listAgencies } from '@/lib/crm/partners';
import { fxRates } from '@/lib/crm/money';
import { LeadWorkspace } from '@/components/crm/lead-workspace';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const related = await relatedLeads(lead);
  /* Only what the picker needs. The commission terms stay on the server —
     they have no business crossing to the browser on a lead page. */
  const agencies = (await listAgencies()).map((a) => ({
    id: a.id,
    name: a.name,
    contacts: a.contacts.filter((c) => !c.inactive).map((c) => ({ id: c.id, name: c.name })),
  }));
  const [editor, owner] = await Promise.all([canEdit(), isAdmin()]);

  return (
    <>
      <div className="crm-head">
        <div>
          <Link href="/admin/leads" className="crm-meta" style={{ textDecoration: 'none' }}>← All leads</Link>
          <h1 className="crm-title" style={{ marginTop: 6 }}>{lead.name || 'Unknown lead'}</h1>
          <p className="crm-sub">
            {(lead.form_type || 'enquiry').replace('_', ' ')}
            {lead.form_origin ? ` · ${lead.form_origin}` : ''}
          </p>
        </div>
      </div>
      {/* The roster lives in env (server-only), so the workspace gets the names
          it may assign to as a prop. `today` comes from here too: the earliest
          date the parking picker will accept has to be the server's idea of
          today, since the server is what validates it. */}
      <LeadWorkspace
        lead={lead}
        related={related}
        roster={agents().map((a) => a.name)}
        agencies={agencies}
        today={new Date().toISOString().slice(0, 10)}
        rates={fxRates()}
        admin={owner}
        readOnly={!editor}
      />
    </>
  );
}

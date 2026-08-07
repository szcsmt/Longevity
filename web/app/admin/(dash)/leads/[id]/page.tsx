import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/crm/auth';
import { agents } from '@/lib/crm/agents';
import { getLead, relatedLeads } from '@/lib/crm/store';
import { LeadWorkspace } from '@/components/crm/lead-workspace';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const related = await relatedLeads(lead);

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
          it may assign to as a prop. */}
      <LeadWorkspace lead={lead} related={related} roster={agents().map((a) => a.name)} readOnly={!(await isAdmin())} />
    </>
  );
}

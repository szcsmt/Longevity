import Link from 'next/link';
import { listLeads } from '@/lib/crm/store';
import { PipelineBoard } from '@/components/crm/pipeline-board';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const leads = await listLeads();
  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Pipeline</h1>
          <p className="crm-sub">Drag cards between stages (or use the ‹ › controls). Click a card to open it.</p>
        </div>
        <Link className="crm-btn" href="/admin/leads">List view →</Link>
      </div>
      <PipelineBoard leads={leads} />
    </>
  );
}

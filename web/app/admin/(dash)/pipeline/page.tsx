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
          <h1 className="crm-title">Leadek · tábla nézet</h1>
          <p className="crm-sub">Húzd a kártyát másik oszlopba (vagy használd a ‹ › gombokat). Kattints rá a megnyitáshoz.</p>
        </div>
        <Link className="crm-btn" href="/admin/leads">← Lista nézet</Link>
      </div>
      <PipelineBoard leads={leads} />
    </>
  );
}

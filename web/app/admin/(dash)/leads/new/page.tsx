import Link from 'next/link';
import { NewLeadForm } from '@/components/crm/new-lead-form';

export const dynamic = 'force-dynamic';

export default function NewLeadPage() {
  return (
    <>
      <div className="crm-head">
        <div>
          <Link href="/admin/leads" className="crm-meta" style={{ textDecoration: 'none' }}>← All leads</Link>
          <h1 className="crm-title" style={{ marginTop: 6 }}>Add a lead</h1>
          <p className="crm-sub">A phone enquiry, a walk-in, a referral — anything that didn&apos;t come through the website.</p>
        </div>
      </div>
      <NewLeadForm />
    </>
  );
}

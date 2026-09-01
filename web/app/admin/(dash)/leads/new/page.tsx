import Link from 'next/link';
import { NewLeadForm } from '@/components/crm/new-lead-form';

export const dynamic = 'force-dynamic';

export default function NewLeadPage() {
  return (
    <>
      <div className="crm-head">
        <div>
          <Link href="/admin/leads" className="crm-meta" style={{ textDecoration: 'none' }}>← Összes lead</Link>
          <h1 className="crm-title" style={{ marginTop: 6 }}>Új lead</h1>
          <p className="crm-sub">Telefonos érdeklődés, betérő vendég, ajánlás — bármi, ami nem a weboldalról jött.</p>
        </div>
      </div>
      <NewLeadForm />
    </>
  );
}

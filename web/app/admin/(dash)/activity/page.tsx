import { listEvents } from '@/lib/crm/store';
import { ActivityLog } from '@/components/crm/activity-log';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const events = await listEvents(1500);
  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Activity</h1>
          <p className="crm-sub">Every interaction on the site — WhatsApp, phone, brochure, form opens and visits.</p>
        </div>
      </div>
      <ActivityLog events={events} />
    </>
  );
}

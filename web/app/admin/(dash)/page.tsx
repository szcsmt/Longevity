import { currentUser } from '@/lib/crm/auth';
import { attentionCounts } from '@/lib/crm/store';
import { WelcomeHero } from '@/components/crm/welcome-hero';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [alerts, user] = await Promise.all([attentionCounts(), currentUser()]);
  return <WelcomeHero user={user || ''} alerts={alerts} />;
}

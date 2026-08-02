import { crmUser } from '@/lib/crm/auth';
import { WelcomeHero } from '@/components/crm/welcome-hero';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  return <WelcomeHero user={crmUser()} />;
}

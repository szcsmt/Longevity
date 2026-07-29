import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/crm/auth';
import { LoginForm } from '@/components/crm/login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await isAuthed()) redirect('/admin');
  return <LoginForm />;
}

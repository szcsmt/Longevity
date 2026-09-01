'use client';

import { useRouter } from 'next/navigation';
import { useT } from './lang-provider';

export function LogoutButton() {
  const t = useT();
  const router = useRouter();
  async function logout() {
    await fetch('/api/crm/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }
  return (
    <button className="crm-btn ghost sm" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
      {t('Kilépés')}
    </button>
  );
}

'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/crm/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  }
  return (
    <button className="crm-btn ghost sm" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
      Sign out
    </button>
  );
}

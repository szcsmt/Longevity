'use client';

import { useRouter } from 'next/navigation';

export function PortalSignOut() {
  const router = useRouter();
  return (
    <button
      className="crm-btn ghost"
      onClick={async () => {
        await fetch('/api/partners/logout', { method: 'POST' }).catch(() => {});
        router.replace('/portal');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* Ending somebody else's session. Confirms first, because the person on the
   other end is mid-sentence in a lead note when this lands. */
export function RevokeButton({
  id, user, label, confirm,
}: {
  id?: string;
  user?: string;
  label: string;
  confirm: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (!window.confirm(confirm)) return;
    setBusy(true);
    try {
      await fetch('/api/crm/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { user }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="crm-btn ghost sm" onClick={revoke} disabled={busy}>
      {busy ? '…' : label}
    </button>
  );
}

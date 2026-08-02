'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* Checkbox that toggles a task on its lead, then soft-refreshes the page so
   the item moves between the Tasks page groups. */
export function TaskToggle({ leadId, taskId, done, title }: { leadId: string; taskId: string; done: boolean; title?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="checkbox"
      checked={done}
      disabled={busy}
      aria-label={title ? `Mark "${title}" ${done ? 'open' : 'done'}` : 'Toggle task'}
      onChange={async () => {
        setBusy(true);
        try {
          await fetch(`/api/crm/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op: 'toggleTask', taskId }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

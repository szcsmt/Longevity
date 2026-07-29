'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/* Soft-refreshes the current CRM view on an interval so new leads and live
   interactions appear without a manual reload. router.refresh() re-runs the
   server components (re-reading the store) while preserving client state. */
export function AutoRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

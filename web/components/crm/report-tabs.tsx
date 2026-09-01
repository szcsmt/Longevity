'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ── One menu item, three reports ──

   Analytics, Performance and Kiosztás were three separate lines in a menu of
   thirteen, and they are three answers to one question: how is this going.
   Which one you want depends on whether you mean the campaigns, the people,
   or the workload — a distinction worth making once you are already looking
   at a report, and noise before you are.

   The routes are unchanged. Somebody's bookmark still works, and so does
   every link in the handbook. */
const TABS = [
  { href: '/admin/analytics', label: 'Honnan jönnek' },
  { href: '/admin/performance', label: 'Ki hogy teljesít' },
  { href: '/admin/allocation', label: 'Kiosztás' },
];

export function ReportTabs() {
  const path = usePathname() || '';
  return (
    <div className="report-tabs" role="navigation" aria-label="Riportok">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

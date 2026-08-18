'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />,
  },
  {
    href: '/admin/today',
    label: 'Today',
    icon: <path d="M12 7v5l3 2m-3 7a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" />,
  },
  {
    href: '/admin/leads',
    label: 'Leads',
    icon: <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.3-8 4v3h9m7-7c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4Z" />,
  },
  {
    href: '/admin/pipeline',
    label: 'Pipeline',
    icon: <path d="M4 5h16M4 5v4h10M4 9v4h7m0 0v4h13M14 13h6" />,
  },
  {
    href: '/admin/agencies',
    label: 'Agencies',
    icon: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 11h.01M15 11h.01" />,
  },
  {
    href: '/admin/masterplan',
    label: 'Masterplan',
    icon: <path d="m9 20-6-2V4l6 2m0 14 6-2m-6 2V6m6 12 6 2V6l-6-2m0 14V4M9 6l6-2" />,
  },
  {
    href: '/admin/finance',
    label: 'Payments',
    icon: <path d="M2 7h20v12H2zM2 11h20M6 15h4" />,
  },
  {
    href: '/admin/tasks',
    label: 'Follow-ups',
    icon: <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  },
  {
    href: '/admin/notes',
    label: 'Jegyzetek',
    icon: <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v5h5M8 13h8M8 17h5" />,
  },
  {
    href: '/admin/performance',
    label: 'Performance',
    icon: <path d="M4 20V10m6 10V4m6 16v-7m-12 7h18" />,
  },
  {
    href: '/admin/analytics',
    label: 'Analytics',
    icon: <path d="M3 12c3-6 6-9 9-9s6 3 9 9c-3 6-6 9-9 9s-6-3-9-9Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  },
  {
    href: '/admin/activity',
    label: 'Activity',
    icon: <path d="M2 12h4l3-8 6 16 3-8h4" />,
  },
];

/* Red badge counts: leads = untouched new + awaiting-reply, followups =
   overdue tasks. Zero renders nothing — a clean nav means nothing is burning. */
/* `hidden` carries the hrefs this account has no business on — the Payments
   ledger for marketing, chiefly. Hiding rather than refusing on arrival: a
   menu item that always says "not for you" is a menu item that reads as a
   broken CRM. */
export function CrmNav({
  alerts, hidden = [],
}: {
  alerts?: { today?: number; leads?: number; followups?: number };
  hidden?: string[];
}) {
  const path = usePathname() || '';
  const badgeFor = (href: string) =>
    href === '/admin/today' ? alerts?.today
    : href === '/admin/leads' ? alerts?.leads
    : href === '/admin/tasks' ? alerts?.followups
    : undefined;
  return (
    <nav className="crm-nav">
      {/* Quick search. It used to filter the lead list, which is the right
          answer to "where is that buyer" and no answer at all to "which agency
          was Nok at" or "who is holding B12". */}
      <form action="/admin/search" method="get" className="nav-search">
        <input className="crm-input" name="q" placeholder="Search everything…" aria-label="Search" />
      </form>
      {items.filter((it) => !hidden.includes(it.href)).map((it) => {
        const active = it.href === '/admin' ? path === '/admin' : path.startsWith(it.href);
        const badge = badgeFor(it.href);
        return (
          <Link key={it.href} href={it.href} className={`crm-nav-link${active ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {it.icon}
            </svg>
            {it.label}
            {badge ? <span className="nav-badge" aria-label={`${badge} needs attention`}>{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

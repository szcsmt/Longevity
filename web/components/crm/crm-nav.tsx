'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from './lang-provider';

/* ── The menu, in three groups instead of thirteen equal lines ──

   It had grown to thirteen items, every one of them the same size and the
   same weight, which is a list nobody reads — you scan it once on your first
   day, fail to build a picture of it, and from then on you navigate by
   memory of where things happen to be. Adding a screen made it worse each
   time, and every screen added here was worth having.

   The fix is not fewer features. It is saying out loud that they are not all
   the same kind of thing:

     Munka          the three screens a salesperson lives in all day
     Pénz és papír  the ones they open when something specific comes up
     Vezetői        the owner's, and nobody else sees them at all

   The search box that used to sit above all this moved onto the home page,
   where there is room to say what it searches. A field in a sidebar is a
   field people mistake for a filter on whatever they are looking at, and this
   one searches leads, agencies and units at once.

   Two things went besides. The Pipeline board is a second
   view of the lead list, so it moved onto the lead list as a view switch,
   where its data already is. And Analytics, Performance and Kiosztás are all
   the same question — how is this going — so they are one item with tabs
   inside rather than three items competing for the same glance. */

type Item = { href: string; label: string; icon: React.ReactNode; owner?: true };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Munka',
    items: [
      {
        href: '/admin',
        label: 'Kezdőlap',
        icon: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5M9.5 21v-6h5v6" />,
      },
      {
        href: '/admin/today',
        label: 'Mai teendők',
        icon: <path d="M12 7v5l3 2m-3 7a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" />,
      },
      {
        href: '/admin/leads',
        label: 'Leadek',
        icon: <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.3-8 4v3h9m7-7c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4Z" />,
      },
      {
        href: '/admin/masterplan',
        label: 'Masterplan',
        icon: <path d="m9 20-6-2V4l6 2m0 14 6-2m-6 2V6m6 12 6 2V6l-6-2m0 14V4M9 6l6-2" />,
      },
    ],
  },
  {
    title: 'Pénz és papír',
    items: [
      {
        href: '/admin/finance',
        label: 'Fizetések',
        icon: <path d="M2 7h20v12H2zM2 11h20M6 15h4" />,
      },
      {
        href: '/admin/tasks',
        label: 'Naptár',
        icon: <path d="M3 9h18M7 3v3m10-3v3M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />,
      },
      {
        href: '/admin/notes',
        label: 'Jegyzetek',
        icon: <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 0v5h5M8 13h8M8 17h5" />,
      },
      {
        href: '/admin/agencies',
        label: 'Ügynökségek',
        icon: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 11h.01M15 11h.01" />,
      },
    ],
  },
  {
    title: 'Vezetői',
    items: [
      {
        href: '/admin/analytics',
        label: 'Riportok',
        owner: true,
        icon: <path d="M4 20V10m6 10V4m6 16v-7m-12 7h18" />,
      },
      {
        href: '/admin/security',
        label: 'Biztonság',
        owner: true,
        icon: <path d="M12 3 4 6v6c0 4.4 3.4 8.4 8 9 4.6-.6 8-4.6 8-9V6l-8-3Zm0 6v4m0 3h.01" />,
      },
    ],
  },
];

/** The three report screens live under one menu item, so all three light it. */
const REPORTS = ['/admin/analytics', '/admin/performance', '/admin/allocation'];

/* Red badge counts: leads = untouched new + awaiting-reply, followups =
   overdue tasks. Zero renders nothing — a clean nav means nothing is burning. */
/* `hidden` carries the hrefs this account has no business on — the Payments
   ledger for marketing, chiefly. Hiding rather than refusing on arrival: a
   menu item that always says "not for you" is a menu item that reads as a
   broken CRM. */
export function CrmNav({
  alerts, hidden = [], owner = false,
}: {
  alerts?: { today?: number; leads?: number; followups?: number };
  hidden?: string[];
  /** Whether to show the owner-only group at all. */
  owner?: boolean;
}) {
  const t = useT();
  const path = usePathname() || '';
  const badgeFor = (href: string) =>
    href === '/admin/today' ? alerts?.today
    : href === '/admin/leads' ? alerts?.leads
    : href === '/admin/tasks' ? alerts?.followups
    : undefined;

  const isActive = (href: string) =>
    /* Every route starts with /admin, so the home entry has to match exactly
       or it would be lit on every screen in the CRM. */
    href === '/admin' ? path === '/admin'
      : href === '/admin/analytics' ? REPORTS.some((r) => path.startsWith(r))
      : path.startsWith(href);

  return (
    <nav className="crm-nav">
      {GROUPS.map((group) => {
        const visible = group.items.filter(
          (it) => !hidden.includes(it.href) && (!it.owner || owner),
        );
        if (!visible.length) return null;
        return (
          <div key={group.title} className="nav-group">
            <div className="nav-group-title">{t(group.title)}</div>
            {visible.map((it) => {
              const badge = badgeFor(it.href);
              return (
                <Link key={it.href} href={it.href} className={`crm-nav-link${isActive(it.href) ? ' active' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {it.icon}
                  </svg>
                  {t(it.label)}
                  {badge ? <span className="nav-badge" aria-label={`${badge}`}>{badge}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

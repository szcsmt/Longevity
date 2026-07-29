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
    href: '/admin/leads',
    label: 'Leads',
    icon: <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.3-8 4v3h9m7-7c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4Z" />,
  },
  {
    href: '/admin/pipeline',
    label: 'Pipeline',
    icon: <path d="M4 5h16M4 5v4h10M4 9v4h7m0 0v4h13M14 13h6" />,
  },
];

export function CrmNav() {
  const path = usePathname() || '';
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((it) => {
        const active = it.href === '/admin' ? path === '/admin' : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={`crm-nav-link${active ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {it.icon}
            </svg>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

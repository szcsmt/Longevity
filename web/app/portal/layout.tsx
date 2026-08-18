import type { Metadata } from 'next';
import '../admin/crm.css';

export const metadata: Metadata = {
  title: 'Partner portal · Longevity Resort',
  /* Never indexed. It is a door for people who were given a key, not a page
     anybody should arrive at from a search. */
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}

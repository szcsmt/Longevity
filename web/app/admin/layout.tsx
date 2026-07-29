import type { Metadata } from 'next';
import './crm.css';

export const metadata: Metadata = {
  title: 'CRM · Longevity Resort',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

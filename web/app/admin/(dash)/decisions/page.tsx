import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/* Decisions moved onto Today — the reasoning is on the block itself, in
   components/crm/decision-list.tsx. This stays as a redirect rather than being
   deleted because the address is in people's bookmarks and in the handbook,
   and a link that 404s teaches somebody the CRM is broken when it is merely
   tidier than it was. */
export default function DecisionsPage() {
  redirect('/admin/today');
}

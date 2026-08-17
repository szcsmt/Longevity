import { Suspense } from 'react';
import { canEdit } from '@/lib/crm/auth';
import { listNotes } from '@/lib/crm/store';
import { status as googleStatus } from '@/lib/crm/google-tasks';
import { NotesBoard } from '@/components/crm/notes-board';
import { GoogleTasksStrip } from '@/components/crm/google-tasks-strip';

/* The project board. Everything about Longevity Resort that isn't a lead lives
   here; the board itself is a client component, this page only hands it the
   first render's data so the wall is there before any JavaScript runs. */

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const [notes, editable, google] = await Promise.all([listNotes(), canEdit(), googleStatus()]);
  return (
    <>
      <NotesBoard initial={notes} readOnly={!editable} />
      {/* Suspense because the strip reads the ?google= result of the consent redirect. */}
      <Suspense fallback={null}>
        <GoogleTasksStrip initial={google} readOnly={!editable} />
      </Suspense>
    </>
  );
}

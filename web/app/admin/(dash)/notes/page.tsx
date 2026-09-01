import { Suspense } from 'react';
import { can, canEdit } from '@/lib/crm/auth';
import { allLeadNotes, listNotes } from '@/lib/crm/store';
import { status as googleStatus } from '@/lib/crm/google-tasks';
import { status as gmailStatus } from '@/lib/crm/gmail';
import { NotesBoard } from '@/components/crm/notes-board';
import { LeadNotesFeed } from '@/components/crm/lead-notes-feed';
import { GoogleTasksStrip } from '@/components/crm/google-tasks-strip';
import { GmailStrip } from '@/components/crm/gmail-strip';

/* The project board. Everything about Longevity Resort that isn't a lead lives
   here; the board itself is a client component, this page only hands it the
   first render's data so the wall is there before any JavaScript runs. */

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const [notes, leadNotes, editable, google, gmail, owner] = await Promise.all([
    listNotes(), allLeadNotes(), canEdit(), googleStatus(), gmailStatus(), can('partners.write'),
  ]);
  return (
    <>
      <NotesBoard initial={notes} readOnly={!editable} />

      {/* The board is for the project; this is for the buyers. Kept apart
          because they are two different kinds of writing, and mixing them was
          the mistake that made the lead page unreadable. */}
      <LeadNotesFeed items={leadNotes} />
      {/* Suspense because the strip reads the ?google= result of the consent redirect. */}
      <Suspense fallback={null}>
        <GoogleTasksStrip initial={google} readOnly={!editable} />
        <GmailStrip initial={gmail} canConnect={owner} />
      </Suspense>
    </>
  );
}

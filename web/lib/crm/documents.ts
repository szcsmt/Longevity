/* ── The sales library ──

   Every document we send lives here, and every link that goes out points at
   /d/<id>?l=<lead id> rather than at the file. That indirection buys three
   things:

     · the CRM records WHO opened WHAT and when, on the lead's own timeline;
     · a file can be replaced (new prices, new edition) without touching a
       single link that is already sitting in someone's inbox;
     · a document can be renamed or moved without breaking old letters.

   Pure data, no Node APIs, so both the letters and the admin UI can read it. */

export interface CrmDocument {
  id: string;      // stable slug — appears in the URL, never change it
  title: string;   // shown in the CRM timeline and used as the link label
  file: string;    // path under /public
  note: string;    // what it is, for whoever picks documents in the CRM
  audience?: string; // who it suits, to help the send strategy later
}

export const DOCUMENTS: CrmDocument[] = [
  {
    id: 'overview',
    title: 'Longevity Resort brochure',
    file: '/brochure/longevity-brochure-short-2026.pdf',
    note: '13 pages, 9.9 MB. The short edition — the story cut to what a stranger needs.',
    audience: 'First contact. This is the one that goes out with the welcome.',
  },
  /* A 12-page, 2.6 MB cut of the same story is on disk at
     /brochure/longevity-overview-2026.pdf. It opens roughly four times faster
     on a phone, which matters more than it sounds when the mail is read on
     hotel wifi. Kept, unlinked, in case that trade is ever worth revisiting. */
  {
    id: 'brochure',
    title: 'Longevity Resort brochure',
    file: '/brochure/longevity-brochure-2026.pdf',
    note: '52 pages, 14 MB. The resort, the residences, the villa types with prices.',
    audience: 'Someone who is already reading. Sent once they have shown interest, not on day one.',
  },
];

export const documentById = (id: string): CrmDocument | undefined =>
  DOCUMENTS.find((d) => d.id === id);

/** The tracked URL for a document. Pass the lead id to record who opened it. */
export const docHref = (docId: string, leadId?: string): string =>
  `/d/${docId}${leadId ? `?l=${leadId}` : ''}`;

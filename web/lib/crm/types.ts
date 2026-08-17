/* CRM domain types — shared by the store, API routes and admin UI. */

export type Stage = 'new' | 'contacted' | 'qualified' | 'reserved' | 'won' | 'lost';
export type Score = 'hot' | 'warm' | 'cold';
export type VillaStatus = 'free' | 'reserved' | 'sold';

/* One payment milestone on a plot. `amount` overrides the default computed
   from the phase percentage × contract value. */
export interface VillaPhase {
  paid: boolean;
  at?: string;      // ISO date the payment landed
  amount?: number;  // THB override
  /* When this instalment is expected. Optional because most of the schedule is
     governed by progress on site rather than by the calendar: a phase whose
     construction gate has been passed is due whether or not anyone typed a
     date. Set it when a specific date has actually been agreed. */
  due?: string;     // ISO date
}

export type PhaseKey = 'slot' | 'foundation' | 'build' | 'furnish';

/* The resort's payment schedule: 7% reserves the slot (plot goes to the
   buyer's name), 43% on foundation, 40% on completed building, 10% on
   furnishing. */
export const PHASES: { key: PhaseKey; pct: number; label: string; gate: string }[] = [
  { key: 'slot',       pct: 7,  label: 'Slot deposit · 7%',  gate: 'Plot transferred to buyer' },
  { key: 'foundation', pct: 43, label: 'Foundation · 43%',   gate: 'Foundation complete' },
  { key: 'build',      pct: 40, label: 'Building · 40%',     gate: 'Building complete' },
  { key: 'furnish',    pct: 10, label: 'Furnishing · 10%',   gate: 'Furnishing complete' },
];

export type Construction = 'not_started' | 'foundation' | 'structure' | 'furnishing' | 'done';

export const CONSTRUCTION: { id: Construction; label: string }[] = [
  { id: 'not_started', label: 'Not started' },
  { id: 'foundation',  label: 'Foundation' },
  { id: 'structure',   label: 'Structure up' },
  { id: 'furnishing',  label: 'Furnishing' },
  { id: 'done',        label: 'Completed' },
];

export interface VillaExtra {
  id: string;
  label: string;   // e.g. "Podcast studio", "Office setup"
  price?: number;  // THB, optional
}

export interface VillaRecord {
  status: VillaStatus;
  seller?: string;   // who sold / reserved it
  note?: string;
  updatedAt: string;

  /* Sales tracking (v4) */
  buyerLeadId?: string;     // linked CRM lead
  buyerName?: string;       // denormalized for display
  contractValue?: number;   // THB
  promisedDate?: string;    // ISO date — promised completion
  construction?: Construction;
  phases?: Partial<Record<PhaseKey, VillaPhase>>;
  extras?: VillaExtra[];

  /* Optimistic-concurrency revision, bumped on every save — the same guard the
     Lead has carried since v3. A unit is the one record two salespeople can
     genuinely reach for at the same second, and without this the second write
     silently overwrote the first: two reservations, one kept, no trace of the
     other. The backend refuses a save whose expected revision no longer
     matches, and the domain layer re-reads and redoes the change.
     Absent on rows written before this existed (treated as 0). */
  rev?: number;
}

export interface VillaHistoryEntry {
  id: string;
  villaId: string;
  from: VillaStatus;
  to: VillaStatus;
  seller?: string;
  note?: string;
  at: string;
}

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'new',       label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'reserved',  label: 'Reserved' },
  { id: 'won',       label: 'Won' },
  { id: 'lost',      label: 'Lost' },
];

export const SCORES: Score[] = ['hot', 'warm', 'cold'];

export interface Note {
  id: string;
  body: string;
  at: string; // ISO
  /** Who wrote it. Unset on notes the CRM filed itself (an inbound reply, an
      AI brief) and on everything written before there was more than one user. */
  by?: string;
}

/* The automated customer sequence, minute 0 → day 60. Each step goes out at
   most once per lead and only while the conversation is still one-sided. */
export type EmailStep = 'welcome' | 'reminder' | 'story' | 'viewing' | 'terms' | 'closing';

export interface SentEmail {
  id: string;
  step: EmailStep;
  subject: string;
  at: string; // ISO
}

export const LOST_REASONS = [
  { id: 'price',       label: 'Price' },
  { id: 'timing',      label: 'Timing — not now' },
  { id: 'competitor',  label: 'Bought elsewhere' },
  { id: 'unreachable', label: 'Went silent / unreachable' },
  { id: 'other',       label: 'Other' },
] as const;

export interface Task {
  id: string;
  title: string;
  due?: string;  // ISO date
  done: boolean;
  at: string;    // ISO created
  by?: string;   // who added it
}

/* An automatic audit entry — recorded by the store whenever the lead itself
   changes (created, stage moved, score changed, contact edited). Shown merged
   with notes in the lead timeline, so the full history reads in one place. */
export interface Activity {
  id: string;
  kind:
    | 'created' | 'stage' | 'score' | 'contact' | 'value' | 'merged' | 'email'
    | 'message' | 'assigned' | 'download' | 'click' | 'document' | 'archived'
    /* Contact a salesperson made and logged by hand. Until these existed, a
       phone call could only live in a free-text note — so the single most
       important thing that happens to a lead was the one thing the CRM could
       not see, count or act on. */
    | 'call' | 'video' | 'meeting' | 'visit' | 'whatsapp';
  /** Who did it, when a signed-in person did. Absent for anything the system
      or the customer did — those read as the CRM's own actions. */
  by?: string;
  /* On a logged contact: whether a conversation actually happened. A structured
     field rather than something to read out of `detail`, because the automated
     sequence depends on it — talking to somebody hands the conversation to a
     person, while a call that rang out changes nothing. */
  reached?: boolean;
  detail: string; // human line, e.g. "New → Contacted"
  at: string;     // ISO
}

/* ── The contact a salesperson logs by hand ──

   Kept short on purpose. Every extra option is a decision at the moment
   somebody has just put the phone down and wants to get on with the next call,
   and a list nobody can face is a list nobody fills in. */
export type TouchKind = 'call' | 'video' | 'meeting' | 'visit' | 'whatsapp';

export interface TouchOption {
  key: string;        // what the UI sends; a call has two, so the kind alone will not do
  kind: TouchKind;    // what lands on the timeline as a badge
  label: string;      // on the button
  past: string;       // on the timeline
  /* Did a conversation actually happen. A call that rang out is worth
     recording — it is the difference between "nobody has tried" and "tried
     twice, no luck" — but it is not contact, and nothing downstream should
     treat it as if it were. */
  reached: boolean;
}

export const TOUCHES: TouchOption[] = [
  { key: 'call',        kind: 'call',     label: 'Spoke by phone', past: 'Spoke by phone',    reached: true },
  { key: 'call-missed', kind: 'call',     label: 'No answer',      past: 'Called, no answer', reached: false },
  { key: 'video',       kind: 'video',    label: 'Video call',     past: 'Video call',        reached: true },
  { key: 'meeting',     kind: 'meeting',  label: 'Meeting',        past: 'Met in person',     reached: true },
  { key: 'visit',       kind: 'visit',    label: 'Site visit',     past: 'Site visit',        reached: true },
  { key: 'whatsapp',    kind: 'whatsapp', label: 'WhatsApp',       past: 'Wrote on WhatsApp', reached: false },
];

export const touchByKey = (key: string): TouchOption | undefined =>
  TOUCHES.find((t) => t.key === key);

export interface Lead {
  id: string;

  // Contact
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;

  // Form context
  form_type?: string;    // enquiry | reserve | brochure_request | manual
  form_origin?: string;  // fab | investment | villa: Residence L | phone | referral | ...
  villa?: string;
  gdpr_consent?: boolean;

  /* The language they were reading the site in when they wrote to us. Stored
     because it cannot be re-derived later; the phone-number reading (which is
     stronger) is computed on demand in language.ts. */
  locale?: string;

  // Deal
  value?: number; // expected deal value in THB — defaults from the villa list price

  /* Speed-to-lead: which agent owns this lead, and when a human first acted
     on it (note, reply-timer, or a stage move). */
  owner?: string;
  first_response_at?: string;

  /* Set when an email/offer went out and we're waiting on the customer.
     Cleared when they reply (or the operator clears it). After 3 days the
     CRM flags the lead and the linked plot. */
  awaiting_reply_since?: string;

  /* Why the deal was lost — one of LOST_REASONS. The free-text detail lives
     in a "Lost:" note; this field feeds reporting. */
  lost_reason?: string;

  /* Automated e-mails actually sent to this lead (welcome, reminder…).
     Drives the sequence logic and renders on the timeline. */
  outbox?: SentEmail[];

  /* The customer used the opt-out link in an automated e-mail. Stops the
     sequence for good; e-mails a person writes by hand are unaffected. */
  unsubscribed?: boolean;

  // Attribution
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  source?: string;
  page_url?: string;
  submitted_at?: string;

  // CRM state
  stage: Stage;
  score: Score;
  notes: Note[];
  tasks: Task[];
  history?: Activity[]; // absent on leads created before v2

  created_at: string;
  updated_at: string;

  /* ── Archived, not deleted ──

     Set instead of removing the row. An archived lead is out of every working
     view, every count, every report and the automated sequence, but its
     timeline, its source attribution and its ownership history are all still
     there — which is the whole point of the developer owning the database.
     A salesperson leaving, an enquiry turning out to be a wrong number, or a
     duplicate being folded in must not erase what happened.

     Reversible: `unarchiveLead` clears all three. A genuine erasure (a GDPR
     request) is `purgeLead`, which deletes the row for real and only accepts a
     lead that is already archived — two deliberate steps, never one click. */
  archived_at?: string;
  archived_by?: string;      // the operator who archived it
  archive_reason?: string;   // why, in their words or the system's

  /* Optimistic-concurrency revision. Bumped on every save; the backend refuses
     a save whose expected rev no longer matches, so two concurrent edits can't
     silently overwrite each other. Absent on pre-v3 leads (treated as 0). */
  rev?: number;
}

export type LeadPatch = Partial<
  Pick<Lead, 'name' | 'email' | 'phone' | 'whatsapp' | 'villa' | 'stage' | 'score' | 'value' | 'lost_reason' | 'owner'>
>;

/* A lightweight interaction event — a real click on the live site (open a form,
   tap WhatsApp/phone, download the brochure…). Anonymous by design; it captures
   engagement even when the visitor doesn't complete a form. Kept separate from
   leads so it never pollutes the pipeline. */
export interface CrmEvent {
  id: string;
  type: string;   // click | whatsapp | phone | email | brochure | form_open
  label: string;  // the button/link text
  path?: string;
  source?: string;
  at: string;     // ISO

  /* ── Set on a WhatsApp tap only ──
     The conversation leaves our site at this point and comes back minutes later
     as a bare phone number on Meta's webhook. `ref` is the code carried into the
     prefilled message; the rest is what we knew about the visitor at the moment
     they tapped, held here until the message arrives to claim it. */
  ref?: string;
  locale?: string;
  page_url?: string;
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
}

/* ── Project notes ──

   The board for everything about the project that ISN'T a lead: an idea from a
   phone call, a decision waiting on someone, what the builder asked for, what
   the brochure still gets wrong. Deliberately unstructured — a note is a title,
   some text and/or a checklist, and that is all it has to be. The lead-bound
   follow-ups on the Tasks page stay where they are; these two never mix. */

export const CARD_COLORS = ['plain', 'gold', 'green', 'blue', 'rose', 'violet'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/* Suggested labels, offered in the composer. Free text is allowed too — the
   board collects whatever labels actually exist and offers them as filters. */
export const CARD_LABELS = ['weboldal', 'brossúra', 'CRM', 'sales', 'építkezés', 'marketing', 'jog', 'pénzügy'];

export interface CardItem {
  id: string;
  text: string;
  done: boolean;
}

/* Named ProjectNote, not Note: `Note` is already the lead-bound note above, and
   these two must never be confused for one another. */
export interface ProjectNote {
  id: string;
  title?: string;
  body?: string;
  /** A checklist. A note can have text, a list, or both. */
  items?: CardItem[];
  color?: CardColor;
  labels?: string[];
  /** Pinned notes sit at the top of the board, before everything else. */
  pinned?: boolean;
  /** Archived notes leave the board but are never deleted. */
  archived?: boolean;
  due?: string;    // ISO date
  /** Who it waits on — free text, so it works before there is a user table. */
  owner?: string;
  at: string;        // ISO created
  updatedAt: string; // ISO last touched
  by?: string;       // who created it
  /** The Google Task this card is mirrored to, once the sync has run. */
  googleTaskId?: string;
}

/* CRM domain types — shared by the store, API routes and admin UI. */

/* ── The stages the sales actually has ──

   There were six, and three of the things that really happen to a deal — a
   presentation, a viewing, a negotiation — were not among them. That made the
   funnel lie by omission: everything between "qualified" and "reserved" looked
   like one step, so the report could never say where deals actually die.

   Ten, and not one more. The specification lists fourteen; most of the extra
   ones are either a different concept wearing a stage's clothes (nurture is a
   date, not a stage; "unqualified" is a lost reason) or a distinction nobody
   here would maintain. A stage costs a column on the board and a decision every
   time somebody moves a card, and a board nobody keeps current is worse than a
   coarse one that is true. */
export type Stage =
  | 'new' | 'contacted' | 'qualified' | 'presentation' | 'visit' | 'negotiation'
  | 'reserved' | 'contract' | 'won' | 'lost';
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

/* Order is meaning here, not presentation: the funnel counts "reached this
   stage or beyond" by position, the board draws its columns in this order, and
   `lost` stays last because every report treats it as the exit rather than a
   step. `blurb` is what the stage MEANS — shown where somebody is choosing
   one, because "Presentation" only stops being a guess once it says that a
   presentation actually happened. */
export const STAGES: { id: Stage; label: string; blurb: string }[] = [
  { id: 'new',          label: 'New',          blurb: 'Arrived. Nobody has spoken to them yet.' },
  { id: 'contacted',    label: 'Contacted',    blurb: 'A real conversation has happened.' },
  { id: 'qualified',    label: 'Qualified',    blurb: 'We know the budget, the timeframe, what it is for and where the money comes from.' },
  { id: 'presentation', label: 'Presentation', blurb: 'A presentation or Zoom has actually taken place.' },
  { id: 'visit',        label: 'Visit',        blurb: 'They have seen it — on site, or a live video walkthrough.' },
  { id: 'negotiation',  label: 'Negotiation',  blurb: 'Talking about a specific unit, a price and terms.' },
  { id: 'reserved',     label: 'Reserved',     blurb: 'A unit is held for them.' },
  { id: 'contract',     label: 'Contract',     blurb: 'The SPA is out, under review, or signed.' },
  { id: 'won',          label: 'Won',          blurb: 'Sold.' },
  { id: 'lost',         label: 'Lost',         blurb: 'Not this one. Needs a reason.' },
];

/* ── Reading the order, instead of hard-coding lists of stage names ──

   Every "is this deal still open" and "has it got at least this far" test used
   to be its own literal array in whichever file needed it, which is how six of
   them quietly disagreed. */

export const stageIndex = (id?: string): number => STAGES.findIndex((s) => s.id === id);

/** Everything except the two ways a deal ends. */
export const OPEN_STAGES: Stage[] = STAGES
  .filter((s) => s.id !== 'won' && s.id !== 'lost')
  .map((s) => s.id);

export const isOpenStage = (id?: string): boolean => OPEN_STAGES.includes(id as Stage);

/** At `target` or past it — and never true for a lost deal, which left the
    order rather than travelling along it. */
export const atOrBeyond = (id: string | undefined, target: Stage): boolean =>
  id !== 'lost' && stageIndex(id) >= stageIndex(target);

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

/* ── Qualification ──

   What a salesperson learns in the first real conversation, in fields rather
   than prose. Until now all of it lived in free-text notes, which meant it
   could not be filtered on, could not be counted, and "Qualified" was a stage
   anybody could click without knowing anything at all.

   The specification lists a great deal more than this. Eight is what survived
   the question "does an answer here change what we do next": the first four
   decide whether this is a buyer, the last four decide how to sell to them.
   Everything else belongs in a note, where a sentence says more than a
   dropdown ever will.

   All optional, all defaulting to unknown. A half-filled form is normal and
   must never block anything. */

export const TIMEFRAMES = [
  { id: '0-3',     label: 'Within 3 months' },
  { id: '3-6',     label: '3 to 6 months' },
  { id: '6-12',    label: '6 to 12 months' },
  { id: '12+',     label: 'Over a year' },
  { id: 'unknown', label: 'Not known yet' },
] as const;

export const PURPOSES = [
  { id: 'investment', label: 'Investment' },
  { id: 'lifestyle',  label: 'Lifestyle' },
  { id: 'mixed',      label: 'Both' },
] as const;

export const FINANCING = [
  { id: 'cash',      label: 'Cash' },
  { id: 'financing', label: 'Needs financing' },
  { id: 'unknown',   label: 'Not known yet' },
] as const;

export const DECISION = [
  { id: 'sole',    label: 'Decides alone' },
  { id: 'shared',  label: 'Shares the decision' },
  { id: 'unknown', label: 'Not known yet' },
] as const;

/** Have they been to Koh Samui. A buyer who has stood on the plot behaves
    nothing like one who has only seen photographs. */
export const VISITS = [
  { id: 'been',    label: 'Has been to Samui' },
  { id: 'planned', label: 'Planning a visit' },
  { id: 'no',      label: 'Not been, no plans' },
  { id: 'unknown', label: 'Not known yet' },
] as const;

export const MOTIVATIONS = [
  { id: 'roi',          label: 'Rental return' },
  { id: 'appreciation', label: 'Capital growth' },
  { id: 'personal',     label: 'Personal use' },
  { id: 'retirement',   label: 'Retirement' },
  { id: 'diversify',    label: 'Diversification' },
  { id: 'other',        label: 'Other' },
] as const;

/** What stands in the way. Distinct from a lost reason: this is the objection
    while the deal is alive, and it is the thing the next conversation has to
    answer. */
export const OBJECTIONS = [
  { id: 'price',      label: 'Price' },
  { id: 'ownership',  label: 'Ownership structure' },
  { id: 'legal',      label: 'Legal / title' },
  { id: 'roi',        label: 'Doubts the return' },
  { id: 'location',   label: 'Location' },
  { id: 'trust',      label: 'Trust in the developer' },
  { id: 'timing',     label: 'Timing' },
  { id: 'financing',  label: 'Financing' },
  { id: 'other',      label: 'Other' },
] as const;

export const CURRENCIES = ['THB', 'EUR', 'USD', 'GBP'] as const;

export interface Qualification {
  /** In `currency`, not THB — a buyer thinks in their own money and writing it
      down converted loses what they actually said. */
  budget?: number;
  currency?: string;
  timeframe?: string;
  purpose?: string;
  financing?: string;
  decision?: string;
  visit?: string;
  motivation?: string;
  objection?: string;
}

export const LOST_REASONS = [
  { id: 'price',       label: 'Price' },
  { id: 'timing',      label: 'Timing — not now' },
  { id: 'competitor',  label: 'Bought elsewhere' },
  { id: 'unreachable', label: 'Went silent / unreachable' },
  { id: 'other',       label: 'Other' },
] as const;

/* ── Nurture ──

   Not every lead that will not buy this month is lost. In this business the
   six-to-eighteen-month gap is normal: they are waiting on a Thailand trip, on
   a house sale, on a partner, on the next phase coming out of the ground.

   Until now there were two places to put them, and both were wrong. Closed
   Lost meant nobody ever looked again and the lost-reason report filled up
   with deals that were never lost. Left in Qualified they sat there being
   flagged as stalled every single day, teaching everyone to ignore the flags.

   Nurture is a date and a reason: the lead keeps its stage, leaves the working
   queue until that date, and comes back on it. Nothing else changes. */

export const NURTURE_REASONS = [
  { id: 'visit',   label: 'Waiting on a trip to Thailand' },
  { id: 'funds',   label: 'Waiting on funds' },
  { id: 'later',   label: 'Buying, but not this year' },
  { id: 'partner', label: 'Needs a partner’s decision' },
  { id: 'build',   label: 'Waiting on construction progress' },
  { id: 'other',   label: 'Other' },
] as const;

/* ══════════════════ External agencies and the agents who introduce buyers ══════════════════

   Careful with the word "agent". In this codebase it already means one of OUR
   salespeople — the roster in `agents.ts`, the `owner` on a lead, the `agent`
   login role. The people below work for somebody else and bring us buyers.

   So: an **Agency** is the firm we have (or are negotiating) an agreement with,
   and a **Broker** is a named person at that firm. An internal agent sells; an
   external broker introduces. The UI says "agency" and "agent" because that is
   what the operator calls them, and the code says Agency and Broker because
   `Agent` was taken and quietly reusing it would be a bug waiting to happen.

   Until now an introducing agency was a free-text word in `source`. That meant
   no registration date, no way to settle who introduced a buyer first, and no
   answer to "which agencies actually produce sales". None of it can be
   reconstructed after the fact, which is why this came before the prettier
   work. */

export const AGENCY_STATUS = [
  { id: 'prospect', label: 'In discussion' },
  { id: 'active',   label: 'Active' },
  { id: 'paused',   label: 'Paused' },
  { id: 'ended',    label: 'Agreement ended' },
] as const;

export const COMMISSION_MODELS = [
  { id: 'percent', label: 'Percentage of the sale' },
  { id: 'fixed',   label: 'Fixed fee per sale' },
  { id: 'tiered',  label: 'Tiered / negotiated' },
  { id: 'none',    label: 'Nothing agreed yet' },
] as const;

/** A named person at an agency. Kept thin on purpose: what we need is somebody
    to call and somebody to credit, not a second CRM inside this one. */
export interface Broker {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  /** They have left, or we no longer deal with them. Never deleted — their
      registrations are still part of the record. */
  inactive?: boolean;
}

export interface Agency {
  id: string;
  name: string;
  country?: string;
  website?: string;
  status: string;            // AGENCY_STATUS
  agreement_at?: string;     // ISO date the agreement was signed
  commission_model?: string; // COMMISSION_MODELS
  commission_pct?: number;   // when the model is a percentage
  commission_fixed?: number; // THB per sale, when the model is a fixed fee
  /* How many days a registration protects this agency's claim on a buyer.
     Absent means the house default (CRM_AGENCY_PROTECTION_DAYS, else 90) —
     an agency that negotiated something different carries its own number. */
  protection_days?: number;
  contacts: Broker[];
  note?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  archived_by?: string;
}

/* ── A registration, and the claim it creates ──

   The thing that gets argued over by e-mail in this business: "we introduced
   that buyer to you in March". A claim is that assertion, timestamped, with
   whoever recorded it named, and it is NEVER edited or deleted — a second
   agency registering the same person adds a claim, it does not replace one.

   `expires_at` is the protection window, computed once at registration from
   the agency's own terms. Expiry does not remove the attribution — whoever
   brought the buyer still brought them, and `creditedClaim` says so. It only
   governs whether a later registration by somebody else is refused. */
export interface AgencyClaim {
  id: string;
  agencyId: string;
  /** Denormalised at registration. An agency can be renamed or archived; the
      claim has to keep reading as it did on the day it was made. */
  agencyName: string;
  brokerId?: string;
  brokerName?: string;
  at: string;              // ISO — when it was registered with us
  expires_at?: string;     // ISO date the protection window closes
  note?: string;
  by?: string;             // the operator who recorded it
  /* Released: the registration was withdrawn or found to be wrong. Kept, with
     the reason — a withdrawn claim is evidence too. */
  released_at?: string;
  release_reason?: string;
  /** Recorded over the top of another agency's live claim, deliberately and by
      somebody who had to confirm it. Holds the claim id it went over. */
  overrode?: string;
}

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
    | 'call' | 'video' | 'meeting' | 'visit' | 'whatsapp'
    /* An agency registered this buyer, or a registration was released. The
       one kind of timeline entry that decides who gets paid. */
    | 'registered'
    /* Parked until a date, or brought back. Its own kind rather than a note,
       because the queue rules read it and a report will want to count it. */
    | 'nurture';
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

  /* The stage the deal was in when it was lost. Stored rather than read back
     out of the timeline text, because "where do deals die" is the question the
     funnel exists to answer and a rule that parses a sentence breaks the day
     somebody rewords a label. Absent on anything lost before this existed —
     those deals are counted as lost, and honestly left out of the by-stage
     breakdown rather than guessed at. */
  lost_from?: Stage;

  /* ── Parked until a date ──
     While `nurture_until` is in the future the lead is out of the working
     queue and out of the automated sequence, and no stall or no-next-step rule
     touches it. On the day it arrives the lead comes back, in its own section,
     with the reason it was parked still attached. Cleared by reactivating, and
     by any stage change — a lead that has moved is a lead somebody is
     working. */
  nurture_until?: string;   // ISO date
  nurture_reason?: string;  // one of NURTURE_REASONS

  /* Every agency registration ever made against this person, oldest first.
     Append-only: a claim is released, never removed, and a competing
     registration adds a second entry rather than overwriting the first. */
  claims?: AgencyClaim[];

  /* What the first real conversation established. Absent until somebody fills
     any of it in; a half-filled qualification is normal. */
  qualification?: Qualification;

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

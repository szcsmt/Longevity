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
}

export interface Task {
  id: string;
  title: string;
  due?: string;  // ISO date
  done: boolean;
  at: string;    // ISO created
}

/* An automatic audit entry — recorded by the store whenever the lead itself
   changes (created, stage moved, score changed, contact edited). Shown merged
   with notes in the lead timeline, so the full history reads in one place. */
export interface Activity {
  id: string;
  kind: 'created' | 'stage' | 'score' | 'contact' | 'value' | 'merged' | 'email';
  detail: string; // human line, e.g. "New → Contacted"
  at: string;     // ISO
}

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

  // Deal
  value?: number; // expected deal value in THB — defaults from the villa list price

  /* Set when an email/offer went out and we're waiting on the customer.
     Cleared when they reply (or the operator clears it). After 3 days the
     CRM flags the lead and the linked plot. */
  awaiting_reply_since?: string;

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

  /* Optimistic-concurrency revision. Bumped on every save; the backend refuses
     a save whose expected rev no longer matches, so two concurrent edits can't
     silently overwrite each other. Absent on pre-v3 leads (treated as 0). */
  rev?: number;
}

export type LeadPatch = Partial<
  Pick<Lead, 'name' | 'email' | 'phone' | 'whatsapp' | 'villa' | 'stage' | 'score' | 'value'>
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
}

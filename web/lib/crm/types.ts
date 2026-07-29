/* CRM domain types — shared by the store, API routes and admin UI. */

export type Stage = 'new' | 'contacted' | 'qualified' | 'reserved' | 'won' | 'lost';
export type Score = 'hot' | 'warm' | 'cold';

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

export interface Lead {
  id: string;

  // Contact
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;

  // Form context
  form_type?: string;    // enquiry | reserve | brochure_request
  form_origin?: string;  // fab | investment | villa: Residence L | ...
  villa?: string;
  gdpr_consent?: boolean;

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

  created_at: string;
  updated_at: string;
}

export type LeadPatch = Partial<
  Pick<Lead, 'name' | 'email' | 'phone' | 'whatsapp' | 'villa' | 'stage' | 'score'>
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

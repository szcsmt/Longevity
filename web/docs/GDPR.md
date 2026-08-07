# GDPR / Data Protection — Working Document

**Status: internal working document. This is an engineering-level inventory of what the
Longevity CRM actually does with personal data, written from the source code. It is not
legal advice and has not been reviewed by a lawyer or DPO.**

Scope: the CRM built into the marketing site at `web/` (Next.js on Vercel), its lead
intake endpoints, the admin UI under `/admin`, and the integrations wired into it.
Longevity Samui acts as the data controller; the services listed in section 4 act as
processors.

---

## 1. What personal data is stored

### 1.1 Leads (`crm_leads` table / `leads` array)

Defined in `lib/crm/types.ts` (`Lead`). One JSONB document per lead.

| Field group | Fields | Notes |
|---|---|---|
| Identity / contact | `name`, `email`, `phone`, `whatsapp` | Free text from forms, capped at 300 chars each |
| Interest | `villa`, `form_type`, `form_origin`, `value` (THB), `lost_reason` | |
| Consent | `gdpr_consent` (boolean) | See section 5 |
| Attribution | `utm_source/medium/campaign/term/content`, `source`, `page_url`, `submitted_at` | Marketing attribution, no cookies read server-side |
| Notes | `notes[]` — free-text bodies up to 4,000 chars | **Contains message content**: enquiry-form messages and inbound WhatsApp message bodies land here verbatim (`store.ts` `upsertLeadFromPayload`) |
| Tasks | `tasks[]` — operator to-dos with due dates | May reference the person in free text |
| History | `history[]` — audit trail (created, stage/score changes, contact edits, merges, emails) | |
| Outbox | `outbox[]` — subjects and timestamps of automated emails sent to the lead | |
| Bookkeeping | `stage`, `score`, `awaiting_reply_since`, `created_at`, `updated_at`, `rev` | |

### 1.2 Villas (`crm_villas`, `crm_villa_history`)

`VillaRecord` in `lib/crm/types.ts`:

- `buyerLeadId` and `buyerName` — the buyer's name is **denormalized** onto the plot record.
- `seller` — name of the salesperson who sold/reserved the unit (staff personal data).
- `note` — free text, may contain personal details.
- `VillaHistoryEntry` keeps `seller` and `note` per status change, permanently
  (the code comment in `setVillaStatus` is explicit: "the audit trail keeps it"
  even after a plot returns to `free`).

### 1.3 Interaction events (`crm_events`)

`CrmEvent` is **anonymous by design** (comment in `types.ts`): `type`, `label`, `path`,
`source`, timestamp. No name, no IP, no user identifier is stored. The public
`/api/event` and `/api/lead` endpoints read `x-forwarded-for` only for an in-memory,
per-instance rate limiter (`Map` in the route module); IPs are never persisted.

### 1.4 Suppression blocklist (`crm_blocklist`)

Normalized contact keys, not full records: `e:<lowercased email>` and
`p:<last 9 phone digits>` (`store.ts` `contactKeys`). Populated by "Delete & block"
(`DELETE /api/crm/leads/[id]?block=1`). Purpose: an erased/objecting contact's next
inbound WhatsApp message must **not** recreate a lead (`/api/ingest` checks
`isBlockedContact` first). Keeping a minimal suppression record after erasure is
standard practice — honouring an objection or erasure requires remembering *whom*
not to process (GDPR Art. 17(3)(b) / Art. 21 logic). Note the keys are stored in
normalized plain text, not hashed — see TODO list.

### 1.5 CRM operator accounts

No user table. Accounts come from env vars (`CRM_USER`/`CRM_PASSWORD`, `CRM_USERS`
as `name:password` (admin) or `name:password:viewer` entries — `lib/crm/auth.ts`).
There are two roles: `admin` (full access) and `viewer` (read-only — every mutating
`/api/crm/*` endpoint rejects viewers with 403 via `isAdmin()`). The session cookie (`lr_crm`, 30 days,
httpOnly, Secure in production, SameSite=Lax) contains the base64url username plus a
SHA-256 token derived from name+password+salt. Aside from seller names on villa
records (see 1.2), staff usernames are the only operator personal data the system
holds, and only in env config and cookies.

---

## 2. Where the data lives

| Environment | Storage | Selected by |
|---|---|---|
| Production (Vercel) | **Neon Postgres** over HTTPS (`@neondatabase/serverless`), connection from `DATABASE_URL` / `POSTGRES_URL`; tables `crm_leads`, `crm_events`, `crm_villa_history` (JSONB documents), `crm_villas` (a `status` column plus a JSONB `data` document), `crm_blocklist` (plain-text keys, no JSONB) (`lib/crm/backend-pg.ts`) | `hasDatabase()` in `lib/crm/backend.ts` |
| Local development | One JSON file at `~/.longevity-crm/db.json` (or `CRM_DATA_DIR`), atomic writes (`lib/crm/backend-file.ts`) | No `DATABASE_URL`/`POSTGRES_URL` set |

The dev file lives **outside the repository**, so lead data cannot be committed to git
by accident. It is, however, unencrypted on the developer's disk — real production data
should not be copied into it.

---

## 3. Data-flow table (source → storage → processors)

| # | Flow | Personal data | Processors touched |
|---|---|---|---|
| 1 | Website forms (enquiry / reserve / brochure) → `POST /api/lead` → CRM store | name, email, phone, message, consent, UTM | Vercel → Neon; new-lead alert email with full contact details via **Resend** to `CRM_NOTIFY_TO` (a Google Workspace mailbox, e.g. crm@longevitysamui.com); minute-0 welcome email to the lead via Resend. The make.com forwarding was removed on 2026-08-07 — the CRM is the sole destination |
| 2 | WhatsApp / Zoho Bigin (legacy) → make.com → `POST /api/ingest` (secret in the `x-ingest-key` header or `?key=` query param) → CRM store | name, phone, WhatsApp message body (base64-decoded) | make.com, Zoho Bigin, Vercel, Neon; alert email via Resend for new contacts only |
| 3 | Manual entry (phone call, walk-in, referral) → admin UI → `POST /api/crm/leads` | whatever the operator types | Vercel, Neon |
| 4 | Site clicks → `POST /api/event` | none (anonymous events) | Vercel, Neon |
| 5 | Villa status changes ↔ Google Sheet (outbound via the Apps Script webhook `SHEET_WEBHOOK`; inbound sheet edits arrive at `POST /api/villa-sync`; both directions authenticated by `SHEET_SECRET`) | villa id, status, **seller name, free-text note** | Google (Sheets / Apps Script) |
| 6 | `GET /api/3destate/units` (key `ESTATE_API_KEY`) → 3DEstate Smart Model | **no personal data by design** — unit id, status, price, sizes, payment-progress %; the route comment states "without exposing buyer identity" and the response contains no buyer/seller fields; the CRM also pushes unit changes outbound to `PARTNER_WEBHOOK_URL` (`partnerPush` in `store.ts` — id, status, price only, same no-personal-data posture) | 3DEstate |
| 7 | Daily cron (Vercel Cron, 07:00 UTC, `vercel.json`) → `GET /api/crm/cron` → the follow-up sequence (day 3 / 10 / 24 / 45 / 60), at most one mail per lead per run | lead name + email | Vercel, Resend |
| 7b | Customer clicks the opt-out link in an automated email → `GET /api/unsubscribe?l=<lead id>` | lead id only (the id is the token; no login, no other data in the URL) | Vercel, Neon |
| 8 | CSV export → `GET /api/crm/export` (authenticated) → operator's device | full contact list of the filtered view | none beyond Vercel (download) |
| 9 | Daily backup cron (Vercel Cron, 03:00 UTC, `vercel.json`) → `GET /api/crm/backup` → full CRM snapshot mailed as a JSON attachment to `CRM_NOTIFY_TO` | **every lead in full** (contacts, notes, tasks, history, outbox), all villa records incl. `buyerName`, last 400 villa-history entries, last 500 events | Vercel, Resend, Google Workspace |

Email processor note: outbound email goes through the **Resend** HTTP API
(`api.resend.com` in `lib/crm/notify.ts` and `lib/crm/mailer.ts`); the account's sending
region is eu-west-1. Automated customer emails are **dark by default** — nothing sends
unless `RESEND_API_KEY` + `CRM_AUTO_FROM` are set and `CRM_AUTO_EMAILS` is not `off`
(`mailer.ts`). Reply-to is `CRM_NOTIFY_TO`, so customer replies land in a Google
Workspace mailbox. Every automated customer email carries a one-click opt-out link
(`/api/unsubscribe`), and the sequence stops on its own as soon as the customer replies,
the deal moves on, or the sixth letter (day 60) has gone out — it never runs indefinitely.
The engine also refuses to mail any lead that predates its activation. The one-click reply templates in `lib/crm/templates.ts` only build
`mailto:`/`wa.me` links — nothing is sent by the server from those.

---

## 4. Processor inventory

| Processor | Role | Data received |
|---|---|---|
| Vercel | Hosting, serverless functions, cron | All request payloads in transit; env secrets |
| Neon | Postgres database (system of record) | Full lead / villa / blocklist data at rest |
| Resend (eu-west-1) | Transactional email | Lead contact details in operator alerts; lead name+email in customer emails; the **full daily backup snapshot** as a JSON attachment (`/api/crm/backup`) |
| Google Workspace | Operator mailboxes (`CRM_NOTIFY_TO`, reply-to) | Alert emails, customer replies, daily full-database backup attachments |
| Google Sheets / Apps Script | Villa availability mirror | Villa status, seller names, notes |
| make.com | Automation hub (form forwarding out; WhatsApp/Bigin ingestion in) | Full form payloads; WhatsApp sender name, phone, message |
| Zoho Bigin | Legacy CRM / customer email sender (being phased out) | Leads it originated; customer email until the CRM mailer is switched on |
| 3DEstate | 3D masterplan integration | **No personal data** (unit availability/pricing only) |

Action item: confirm a DPA (or equivalent SCC coverage) exists with each of the above.

---

## 5. Consent capture

- The website forms (`components/enquiry-modal.tsx`, `components/brochure-download.tsx`,
  `components/cta-section.tsx`) include a **required consent checkbox** linking to the
  `/privacy` page, and submit `gdpr_consent: true` with the lead.
- `/api/lead` stores `gdpr_consent` strictly as `payload === true`; `/api/ingest`
  accepts `true` or the string `'true'` (`p.gdpr_consent === true || p.gdpr_consent
  === 'true'`). Consent is never inferred from anything else.
- WhatsApp-ingested leads normally arrive **without** the flag (the person messaged us;
  the applicable basis is more likely legitimate interest / pre-contractual steps —
  document this in the privacy policy).
- Consent survives merges: `mergeLeads` in `store.ts` carries it forward
  ("Consent is evidence — never lose it in a merge"), and duplicate cleanup
  (`dedupeMerge`) uses the same path.
- The CRM UI shows it per lead ("GDPR consent given") and the CSV export includes a
  `gdpr_consent` column.
- Limitation: it is a bare boolean. No consent-text version, no separate consent
  timestamp (only `submitted_at`), no distinct marketing-vs-contact purposes.

---

## 6. Data-subject rights — how each is served today

| Right | Mechanism in the code |
|---|---|
| Access (Art. 15) | Operator opens the lead in the admin UI (`/admin/leads/[id]` shows contact, consent, notes, tasks, full timeline) and/or runs the CSV export (`GET /api/crm/export`) filtered to that person (`?q=email`) |
| Rectification (Art. 16) | `PATCH /api/crm/leads/[id]` op `update` — name/email/phone/whatsapp/villa editable; edits are logged in the lead history |
| Erasure (Art. 17) | `DELETE /api/crm/leads/[id]` (single), bulk delete via `POST /api/crm/leads/bulk`. Row is physically deleted from `crm_leads` |
| Erasure + stop future processing | `DELETE …?block=1` ("Delete & block"): deletes the lead **and** adds `e:`/`p:` keys to the suppression blocklist so inbound WhatsApp can never recreate it |
| Objection (Art. 21) | **Self-service**: the opt-out link at the foot of every automated email (`GET /api/unsubscribe?l=<id>`) sets `unsubscribed` and ends the sequence immediately. Plus the blocklist (`?block=1`) for a full stop, and automated email stops anyway when the lead is deleted (the sweep iterates stored leads only) |
| Portability (Art. 20) | CSV export (machine-readable). See TODO: no per-lead JSON export, and the CSV contains note *counts*, not note bodies |
| Withdraw consent | No self-service; handled manually by an operator (edit or delete the lead) |

Known gaps in erasure are listed in the TODO section (villa `buyerName`, villa history,
previously mailed daily backup snapshots, and copies held by make.com / Bigin /
Google Sheet / mailboxes are outside this system).

---

## 7. Retention — current state

| Data | Current behaviour | Where |
|---|---|---|
| Leads | **No automatic expiry — kept forever.** This is an open decision, not a policy | — |
| Events, type `visit` | Capped at the most recent **5,000**; older visits are deleted on insert | `backend-pg.ts` `insertEvent`, `backend-file.ts` |
| Events, other types (clicks, WhatsApp, brochure, form opens) | Never deleted automatically ("Never drop actionable signals") | both backends |
| Villa history | File backend caps at **3,000** entries; the Postgres backend has **no cap** (reads are limited to 400 via `getVillaData`) | `backend-file.ts` / `backend-pg.ts` |
| Blocklist | Kept indefinitely (that is its purpose) | `crm_blocklist` |
| Backup snapshots | Full-database JSON mailed **daily** to `CRM_NOTIFY_TO`; kept as long as the mailbox keeps them — an erased lead lives on in every older snapshot. No mailbox retention rule exists yet | `/api/crm/backup`, `vercel.json` (03:00 UTC) |
| Session cookie | 30 days (`maxAge` in `/api/crm/login`) | browser |
| Rate-limit IP map | In-memory only, per serverless instance, cleared at 5,000 entries / instance recycle | `/api/lead`, `/api/event` |

**Open decision to make:** a retention rule for leads — e.g. delete or anonymize lost
leads N months after `lost`, and inactive leads without consent after N months. Nothing
in the code implements this today.

---

## 8. Security measures relevant to Art. 32 (as implemented)

- All admin/API traffic over HTTPS (Vercel); DB access over HTTPS to Neon.
- Admin routes and CRM APIs require the session cookie (`isAuthed()` on every
  `/api/crm/*` route; `/api/crm/cron` and `/api/crm/backup` alternatively accept
  `Authorization: Bearer CRON_SECRET` so Vercel Cron can call them — a manual
  backup trigger requires an **admin** session, not just any session); login uses
  constant-time comparison;
  production fails closed when `CRM_PASSWORD` is missing (the primary account is
  disabled; only accounts from `CRM_USERS` remain).
- Role-based access: `viewer` accounts are read-only — every mutating `/api/crm/*`
  endpoint checks `isAdmin()` and returns 403 for them.
- Machine endpoints each have their own rotatable secret: `INGEST_SECRET` (make.com),
  `SHEET_SECRET` (Google Sheet), `ESTATE_API_KEY` (3DEstate), `CRON_SECRET` (Vercel cron).
- Public endpoints are rate-limited per IP; inbound lead strings are length-capped and
  control-character-stripped (`cleanText` in `store.ts`); event fields are length-capped
  only (no `cleanText`); the lead PATCH endpoint
  whitelists patchable fields; CSV export neutralizes spreadsheet formula injection.
- Optimistic concurrency (`rev`) prevents silent overwrites of lead data.
- The 3DEstate feed deliberately exposes no personal data.

---

## 9. Breach response — basics

1. **Contain:** rotate the affected secrets immediately — all are env vars on Vercel:
   `DATABASE_URL`, `CRM_PASSWORD` / `CRM_USERS`, `RESEND_API_KEY`, `INGEST_SECRET`,
   `SHEET_SECRET`, `ESTATE_API_KEY`, `CRON_SECRET`, `MAKE_WEBHOOK`,
   `PARTNER_WEBHOOK_URL`. Rotating
   `CRM_PASSWORD`/`CRM_USERS` invalidates every session cookie (the token is derived
   from the password).
2. **Assess scope:** query Neon directly (`SELECT count(*) FROM crm_leads`, audit
   Neon's access logs) to establish which subjects and fields were exposed.
3. **Notify:** supervisory-authority notification within 72 hours of awareness if the
   breach poses a risk (Art. 33); notify affected individuals without undue delay if
   the risk is high (Art. 34). Lead records contain names, emails, phone numbers and
   message content — a leak of `crm_leads` would generally meet the notification bar.
4. **Record:** keep an internal breach log regardless of whether notification was
   required.
5. Remember the copies outside this system: make.com scenarios, Zoho Bigin, the Google
   Sheet, Resend logs, and the operator mailboxes — including the daily
   `crm-backup-*.json` attachments, each of which is the entire database.

---

## 10. Open GDPR items (honest TODO, from the code)

1. **No retention policy for leads** — nothing ever expires or anonymizes them. Decide
   and implement (see section 7).
2. **No per-lead data-export endpoint** — access/portability today is the list CSV
   plus reading the UI; the CSV exports note *counts*, not note bodies, so a complete
   Art. 15 response requires manual assembly.
3. **The public form intake does not check the blocklist** — `isBlockedContact` is only
   called in `/api/ingest` (WhatsApp path). A blocked contact who submits the website
   form again gets a new lead. Decide whether that is intended (a fresh form submission
   is arguably fresh consent) and document it either way.
4. **Blocklist keys are plain normalized text** (`e:<email>`, `p:<digits>`), not hashed.
   A hashed suppression list would serve the same purpose with less residual data.
5. **Erasure does not cascade to villa records** — deleting a lead leaves the
   denormalized `buyerName` (and `buyerLeadId`) on a linked `crm_villas` row, and
   seller names/notes stay in `crm_villa_history` indefinitely (unbounded in Postgres).
6. **Consent record is a bare boolean** — no consent-text version, timestamp, or
   purpose granularity.
7. **Single shared DB credential** (`DATABASE_URL`) and env-configured operator accounts
   with plaintext passwords in env vars; no per-operator audit of who edited a lead
   (the auth layer knows *who* is signed in, but `logActivity` does not record it).
8. **Full form payloads are forwarded verbatim to make.com** (`/api/lead`); verify the
   make.com (and Zoho, Resend, Neon, Vercel, Google) DPAs and data locations, and drop
   the forward once Bigin is retired.
9. **No login rate-limiting** on `/api/crm/login` (the constant-time check helps, but
   brute force is unthrottled).
10. **Privacy policy alignment** — the `/privacy` page the consent checkbox links to
    must actually name the processors in section 4 and the retention rules once decided.
11. **Erasure does not reach the mailed backups** — a deleted lead survives in every
    previously mailed daily snapshot (`/api/crm/backup` → `crm-backup-*.json` in the
    `CRM_NOTIFY_TO` mailbox). Define a retention window for backup attachments and
    purge older ones.

# API & Webhook Reference

Complete reference for every HTTP endpoint under `app/api/` plus the outbound webhooks the
backend calls. Everything documented here is taken directly from the route and library source
(`app/api/**/route.ts`, `lib/crm/*.ts`, `vercel.json`).

All routes are declared `dynamic = 'force-dynamic'` — responses are never cached.

## Authentication methods

| Method | How it works | Used by |
|---|---|---|
| Public | No auth. `/api/lead` and `/api/event` are additionally protected by a per-IP rate limit; login/logout are not rate limited. | `/api/lead`, `/api/event`, `/api/crm/login`, `/api/crm/logout` |
| Session cookie | `lr_crm` httpOnly cookie set by `/api/crm/login`. Value is `base64url(name).sha256(name:password:salt)`; verified against the env-configured accounts on every request (`lib/crm/auth.ts`). Password/token checks use constant-time comparison. | All `/api/crm/*` routes except login/logout |
| `x-ingest-key` | Header (or `?key=` query param) compared to `INGEST_SECRET`. Fails closed: 401 when the env var is unset. | `/api/ingest` |
| Body secret | `secret` field in the JSON body compared to `SHEET_SECRET`. Fails closed. | `/api/villa-sync` |
| `x-api-key` | Header (preferred) or `?key=` query param compared to `ESTATE_API_KEY`. Fails closed. | `/api/3destate/units` |
| `CRON_SECRET` bearer | `Authorization: Bearer <CRON_SECRET>`. A valid session cookie is accepted as an alternative (manual trigger by an operator) — any session for `/api/crm/cron`, an **admin** session for `/api/crm/backup`. | `/api/crm/cron`, `/api/crm/backup` |

Two roles exist (`lib/crm/auth.ts`): **admin** (full access) and **viewer** (read-only —
every mutating CRM endpoint rejects a viewer session with
`403 {"ok":false,"error":"read-only account"}`). Accounts come from `CRM_USER` +
`CRM_PASSWORD` (the primary account, always admin) merged with `CRM_USERS`
(comma-separated `name:password` or `name:password:viewer`; default role is admin).
In production a missing `CRM_PASSWORD` disables the primary account (fails closed); the
`admin`/`longevity` fallback exists only outside production.

## Rate limits

Only the two fully public intake endpoints are rate limited. Both limits are in-memory
**per serverless instance** (best-effort, not global), keyed on the first entry of
`x-forwarded-for`; the map is cleared when it exceeds 5000 IPs.

| Endpoint | Limit | On excess |
|---|---|---|
| `POST /api/lead` | 5 requests / minute / IP | `429 {"ok":false}` |
| `POST /api/event` | 30 requests / minute / IP | `429 {"ok":false}` |

---

## Public site endpoints

### POST /api/lead

Website form intake (enquiry, reserve, brochure, 3D-twin enquiry form). Public, rate limited
(5/min/IP). Stores the lead in the CRM first (best-effort — a store failure never breaks the
visitor's submit), then forwards the **raw, unmodified body** to the `MAKE_WEBHOOK` URL if set.

Request body (JSON; invalid JSON → `400 {"ok":false,"error":"invalid json"}`). All string
fields are control-character-cleaned and capped at **300 chars** on storage:

| Field | Type | Notes |
|---|---|---|
| `name`, `email`, `phone`, `whatsapp` | string | Contact details |
| `form_type` | string | e.g. `enquiry` \| `reserve` \| `brochure_request` |
| `form_origin` | string | e.g. `fab`, `investment`, `villa: Residence L` |
| `villa` | string | Free text; matched against the catalogue for the default deal value |
| `message` | string | Free text; becomes a timeline note (capped at 4000 chars) |
| `gdpr_consent` | boolean | Stored only when strictly `true` |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | string | Attribution |
| `source`, `page_url`, `submitted_at` | string | Attribution; `submitted_at` defaults to now |

Upsert / dedupe ("one person = one lead", `upsertLeadFromPayload`):
- Contact matching: e-mail (trimmed, lowercased) OR phone key (last 9 digits, only when the
  number has ≥ 8 digits) against `phone`/`whatsapp` of existing leads. The person's most
  recently active lead wins.
- **Known contact** → no new lead. Blank contact fields are filled (never overwritten), the
  message is appended as a note, the score can only be **upgraded** (hot < warm < cold rank —
  a cooler signal never downgrades), an `awaiting_reply` flag is cleared (inbound message
  counts as a reply, the open "Follow up — no reply yet" task is ticked), and a `lost` lead is
  revived to `new` with its `lost_reason` cleared.
- **New contact** → new lead: `stage: 'new'`, score from `lib/crm/scoring.ts`
  (origin starting with `villa` → hot; `reserve` → hot; `enquiry` → hot when origin contains
  `investment`/`reserve` else warm; `brochure_request` → cold; anything else warm), and
  `value` defaulted from the villa list price (`Residence M` 7,650,000 / `L` 8,050,000 /
  `XL` 11,200,000 THB).

Side effects — **only when a lead was actually created** (never on a repeat enquiry):
- `notifyNewLead` — operator alert e-mail via Resend. Silent no-op unless `RESEND_API_KEY`
  **and** `CRM_NOTIFY_TO` are set.
- `sendAutoWelcome` — minute-0 thank-you to the customer. Dark by default: sends only when
  the mailer is enabled (`RESEND_API_KEY` + `CRM_AUTO_FROM` set and `CRM_AUTO_EMAILS` not
  `off`) and the lead has an e-mail. Recorded on the lead's `outbox` as step `welcome`.

Note: this endpoint does **not** check the blocklist — only `/api/ingest` does.

Responses:

| Case | Response |
|---|---|
| Stored, `MAKE_WEBHOOK` unset | `200 {"ok":true,"forwarded":false}` |
| Forwarded | `200 {"ok":<webhook 2xx?>,"forwarded":true}` |
| Webhook fetch threw | `502 {"ok":false,"forwarded":false}` |
| Rate limited | `429 {"ok":false}` |

### POST /api/event

Anonymous interaction event (CTA click, WhatsApp/phone tap, brochure download, form open).
Public, rate limited (30/min/IP). Stored separately from leads. A store failure is swallowed —
tracking never breaks the site.

Request body:

| Field | Required | Cap (on store) | Notes |
|---|---|---|---|
| `label` | yes — empty → `400` | 120 | Button/link text |
| `type` | no | 40 | Defaults to `click` |
| `path` | no | 200 | |
| `source` | no | 80 | |

Response: `200 {"ok":true}`.

---

## Inbound integration endpoints

### POST /api/ingest

Inbound lead ingestion for make.com / Zoho Bigin (WhatsApp leads). Auth: `x-ingest-key`
header or `?key=` = `INGEST_SECRET` (401 otherwise, incl. when the secret is unset). Stores
straight into the CRM and deliberately does **not** forward to `MAKE_WEBHOOK` (loop
avoidance). Body parsing is tolerant — invalid JSON is treated as `{}`.

Flexible field mapping (first non-empty key wins):

| Target | Accepted source keys | Default |
|---|---|---|
| name | `name`, `Full_Name`, `fullName`, `contact_name`, `Contact Name`; else `first_name`/`First Name`/`firstName`/`Owner_First_Name` + `last_name`/`Last Name`/`lastName`; else parsed from a message opener "my name is …" (max 3 words) | — |
| email | `email`, `Email`, `email_address` | — |
| phone | `phone`, `Phone`, `mobile`, `Mobile`, `phone_number`, `Phone Number`, `whatsapp`, `WhatsApp` | — |
| whatsapp | `whatsapp`, `WhatsApp` | falls back to phone |
| message | `message`, `Message`, `note`, `Note`, `Description`, `text`, `body`; else base64-decoded `message_b64` / `messageB64` | — |
| form_type | `form_type` | `whatsapp` |
| form_origin | `form_origin` | `bigin` |
| source | `source`, `Source`, `utm_source`, `Lead Source` | `WhatsApp` |
| utm_campaign | `utm_campaign`, `campaign`, `Campaign` | — |
| page_url | `page_url`, `url` | — |
| gdpr_consent | `gdpr_consent` (`true` boolean or string) | false |
| submitted_at | `submitted_at`, `created_at`, `Created Time` | — |

Behaviour (all "skip" cases return **200** so the make.com scenario never shows red):

| Case | Response |
|---|---|
| No name, e-mail or phone at all | `200 {"ok":false,"skipped":"empty"}` (no-op) |
| Sender is on the blocklist ("Delete & block") | `200 {"ok":true,"skipped":"blocked"}` (no-op) |
| Upserted | `200 {"ok":true,"id":"<lead id>","created":<bool>}` |
| Bad/missing key | `401 {"ok":false,"error":"unauthorized"}` |
| Store failure | `500 {"ok":false,"error":"store error"}` |

Same upsert/dedupe semantics as `/api/lead` (message → note, reply-flag clear, lost-lead
revival, score upgrade only). `notifyNewLead` fires only for genuinely new contacts. The auto
welcome e-mail is **not** sent from this route.

### POST /api/villa-sync

Inbound villa-status sync from the Google Sheet's Apps Script (fires when someone edits the
STATUS/SELLER column in the sheet). Auth: body field `secret` = `SHEET_SECRET` (401 otherwise,
incl. when unset).

Request body:

| Field | Required | Validation |
|---|---|---|
| `secret` | yes | must equal `SHEET_SECRET` |
| `id` | yes | plot id, e.g. `H7` — missing → `400` |
| `status` | yes | `free` \| `sold` \| `reserved` (case-insensitive) — anything else → `400` |
| `seller` | no | capped at 120 on store |
| `note` | no | capped at 500 on store |

Applies `setVillaStatus(..., { silent: true })` — the change is **not** pushed back to
`SHEET_WEBHOOK` (no loop); the partner webhook (`PARTNER_WEBHOOK_URL`, see Outbound
webhooks) **is** still notified. Standard status-change side effects still apply: a villa-history
entry is logged; moving to `free` clears all sales data (buyer, contract value, phases,
extras — the audit trail keeps them); moving to `reserved`/`sold` with no contract value on
record defaults it from the unit's list price. Response: `200 {"ok":true}`.

### GET /api/3destate/units

Partner API for the 3DEstate Smart Model: live state of all 69 units in one call. Auth:
`x-api-key` header (preferred) or `?key=` = `ESTATE_API_KEY` (401 otherwise, incl. when
unset). Response carries `Cache-Control: no-store`.

Response:

```json
{
  "ok": true,
  "generated_at": "<ISO>",
  "total": 69,
  "counts": { "available": 0, "reserved": 0, "sold": 0 },
  "units": [ { /* per unit, see below */ } ]
}
```

Per-unit fields (unit metadata from `lib/villas.json`, live state from the CRM store):

| Field | Meaning |
|---|---|
| `id` | Block letter + number, e.g. `"H7"` |
| `block`, `number` | Split components of the id |
| `status` | `available` \| `reserved` \| `sold` (CRM status `free`/no record → `available`) |
| `price` | THB — the CRM contract value when set, else list price by size type; `null` when not priced |
| `currency` | Always `"THB"` |
| `bedrooms` | 2 for type `2BR`, 1 for `1BR`, else `null` |
| `size_type` | `M` \| `L` \| `XL` \| `null` |
| `area_sqm`, `plot_area_sqm` | From the unit catalogue; `null` when absent |
| `payment_progress` | 0–100 (%) of the payment schedule received, rounded, capped at 100; only when a contract value exists and something was paid — buyer identity is never exposed | 
| `updated_at` | Last CRM change to the unit, or `null` |

---

## CRM admin endpoints (session cookie)

All routes below return `401 {"ok":false}` without a valid `lr_crm` session cookie
(except login/logout). Mutating routes — `POST /api/crm/leads`, `PATCH`/`DELETE
/api/crm/leads/[id]`, `POST /api/crm/leads/bulk`, `PATCH /api/crm/villas` and
`POST /api/crm/dedupe` — additionally require an **admin** session; a viewer session gets
`403 {"ok":false,"error":"read-only account"}`.

### POST /api/crm/login

Public. Body: `{ "username": "...", "password": "..." }`. Credentials are checked in constant
time against every configured account (the scan continues even after a match). On success
sets the `lr_crm` cookie: httpOnly, `SameSite=Lax`, path `/`, `Secure` in production,
30-day max-age. Responses: `200 {"ok":true}` or `401 {"ok":false,"error":"invalid credentials"}`.

### POST /api/crm/logout

Deletes the `lr_crm` cookie. Always `200 {"ok":true}`.

### POST /api/crm/leads

Create a lead by hand (phone enquiry, walk-in, broker referral). Requires an **admin** session.
Body must be a JSON object (else `400 {"ok":false,"error":"invalid json"}`) and contain at
least one of `name` / `email` / `phone` (else `400 {"ok":false,"error":"name, email or phone required"}`).

| Field | Type | Handling |
|---|---|---|
| `name`, `email`, `phone`, `whatsapp`, `villa` | string | trimmed, cleaned, capped at 300 |
| `source` | string | defaults to `manual`; also becomes `form_origin` |
| `score` | string | must be `hot`/`warm`/`cold`, else defaults to `warm` |
| `value` | number | positive finite → rounded; else defaulted from villa list price |
| `note` | string | first timeline note |

The lead is created with `form_type: 'manual'`, `stage: 'new'`. **No upsert/dedupe** — a
manual create always makes a new lead. No notification or welcome e-mail is sent.
Response: `200 {"ok":true,"lead":{...}}`.

### PATCH /api/crm/leads/[id]

Operation-based mutation of one lead. Body: `{ "op": "...", ... }`. Unknown op → `400`;
lead (or task/merge target) not found → `404`. Success: `200 {"ok":true,"lead":{...}}`.
All writes go through optimistic concurrency (per-lead `rev`; up to 4 retries on a lost race).

| `op` | Body fields | Behaviour |
|---|---|---|
| `update` | `patch` object | Only these keys are accepted, everything else is silently dropped (attribution/history/timestamps can never be overwritten): `name`, `email`, `phone`, `whatsapp`, `villa` (strings, capped 300); `stage` (must be `new`/`contacted`/`qualified`/`reserved`/`won`/`lost`); `score` (`hot`/`warm`/`cold`); `value` (`null`/`''` clears; non-negative finite number → rounded); `lost_reason` (`price`/`timing`/`competitor`/`unreachable`/`other`, `null`/`''` clears). Stage/score/contact/value changes are logged to the timeline; moving to any stage other than `lost` clears `lost_reason`. |
| `addNote` | `body` (required, non-empty → else `400`) | Prepends a note (capped 4000). |
| `addTask` | `title` (required → else `400`), `due` (optional ISO) | Appends an open task (title capped 300). |
| `toggleTask` | `taskId` | Flips `done`; unknown task id → `404`. |
| `merge` | `otherId` | Folds the other lead into this one: fills blank contact/attribution fields, keeps GDPR consent if either had it, appends notes/tasks/history (deduped by id — a retried merge is idempotent), logs a `merged` activity once, then deletes the other lead. `otherId === id` → `404`. |
| `awaiting` | `on` (boolean) | `true`: sets `awaiting_reply_since = now`, logs "Email sent — awaiting reply", and adds a "Follow up — no reply yet" task due in 3 days (unless one is already open). `false`: clears the flag, logs "Reply received", ticks the chase task. |

### DELETE /api/crm/leads/[id]?block=1

Deletes the lead. With `?block=1`, the lead's contact keys (`e:<lowercased email>`,
`p:<last-9-digit phone key>` for phone and WhatsApp) are added to the blocklist **first**, so
the person's next WhatsApp message through `/api/ingest` never recreates the lead (used for
private/non-lead contacts, "Delete & block"). Response: `200 {"ok":true}` or `404 {"ok":false}`.

### POST /api/crm/leads/bulk

Bulk action from the leads list. Body:

| Field | Validation |
|---|---|
| `ids` | array of strings, non-strings filtered out, capped at **200**; empty → `400 "no ids"` |
| `action` | `stage` \| `score` \| `delete`; anything else → `400 "unknown action"` |
| `value` | for `stage`: a valid stage id (else `400 "bad stage"`); for `score`: `hot`/`warm`/`cold` (else `400 "bad score"`); ignored for `delete` |

Each lead is attempted independently — one failure never aborts the batch. Response:
`200 {"ok":<failed===0>,"count":<done>,"failed":<failed>}`.

### GET /api/crm/villas

Returns the full villa state: `200 {"ok":true,"villas":{"<id>":VillaRecord,...},"history":[...]}`
(history capped at the last 400 entries).

### PATCH /api/crm/villas

Two modes, selected by the presence of `op`. `id` is always required (`400 "missing id"`).
Success responses include the fresh `villas` + `history`.

**Status change** (no `op`): `{ "id", "status": "free"|"reserved"|"sold", "seller"?, "note"? }`.
Invalid status → `400 "invalid status"`. Side effects: villa-history entry; `free` clears all
sales data; `reserved`/`sold` with no contract value defaults it from the unit list price
(logged); the change is mirrored to the Google Sheet via `SHEET_WEBHOOK` (see Outbound
webhooks). `seller` capped 120, `note` capped 500.

**Sales ops** (`op` is one of `sale` / `phase` / `extraAdd` / `extraRemove` — any other
`op` value is ignored and the request falls through to the status-change mode above,
typically ending in `400 "invalid status"`; a sales op that fails validation, e.g. an
unknown phase key or an empty extra label, → `400 "invalid op"`):

| `op` | Fields | Behaviour |
|---|---|---|
| `sale` | `patch: { buyerLeadId?, buyerName?, contractValue?, promisedDate?, construction? }` | `buyerLeadId` string: links the CRM lead, denormalises the buyer name, and defaults the contract value from the lead's deal value → villa list price → unit list price; `null` unlinks. `buyerName` capped 120. `contractValue`: `null` clears, positive number rounded, invalid ignored. `promisedDate`: `YYYY-MM-DD` (truncated to 10 chars) or `null`. `construction`: one of `not_started`/`foundation`/`structure`/`furnishing`/`done`. Changes are logged to villa history. |
| `phase` | `key: "slot"|"foundation"|"build"|"furnish"`, `paid: bool`, `amount?` | Marks a payment milestone (schedule 7/43/40/10 % of contract value; `amount` overrides the computed figure). Marking paid with no contract value defaults it from the list price. **Money changes availability**: first paid phase on a `free` plot → `reserved`; all four paid → `sold`; a payment-driven status change is logged and synced to the sheet. Unknown key → `400`. |
| `extraAdd` | `label` (required, capped 120), `price?` | Adds a buyer extra (e.g. "Podcast studio"). Empty label → `400`. |
| `extraRemove` | `extraId` | Removes the extra; logged when it existed. |

A record that ends up `free` with no sales data is deleted from the store entirely.

### GET /api/crm/dedupe · POST /api/crm/dedupe

Duplicate cleanup for the backlog (the intake upserts, so this is a safety net). Duplicates
are grouped by shared e-mail OR shared phone key, linked transitively (union-find).

- `GET` — dry-run report: `200 {"ok":true,"groups":N,"extras":N,"sample":[...up to 5 names]}`.
- `POST` — folds each group into its **oldest** lead (the first enquiry keeps the original
  attribution) using the same merge as the `merge` op: `200 {"ok":true,"groups":N,"merged":N}`.

### GET /api/crm/export

CSV export of the (optionally filtered) lead list. Query params match the Leads page:
`stage`, `score`, `form_type`, `q` (free-text over name/e-mail/phone/villa).

Columns: `name`, `email`, `phone`, `whatsapp`, `form_type`, `form_origin`, `villa`, `stage`,
`score`, `source` (falls back to `utm_source`), `utm_medium`, `utm_campaign`, `gdpr_consent`
(`yes`/`no`), `received` (`submitted_at` or `created_at`), `notes` (count), `open_tasks` (count).

Every value originates from the public form and is treated as hostile: cells starting with
`=`, `@`, tab or CR — and `+`/`-` unless the value looks like a phone number — get a leading
`'` so Excel/Sheets never evaluates a formula; cells containing `"`, `,`, `;`, LF or CR are
quoted. Output is UTF-8 with BOM, CRLF line endings,
`Content-Disposition: attachment; filename="longevity-leads-YYYY-MM-DD.csv"`.

### GET /api/crm/cron

Daily follow-up sweep. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) **or** a
valid session cookie (manual trigger). Scheduled in `vercel.json`: `0 7 * * *` (daily 07:00 UTC).

- Mailer dark (env not configured) → `200 {"ok":true,"enabled":false,"sent":0,"note":"auto-emails are dark (env not configured)"}` — fully inert.
- Mailer enabled → runs `runReminders`: for every lead that (a) has an e-mail, (b) is in
  stage `new`/`contacted`/`qualified`, (c) has `awaiting_reply_since` older than **3 days**
  (`REPLY_FLAG_DAYS`), and (d) has no `reminder` in its outbox newer than the current waiting
  period, exactly **one** polite day-3 reminder is sent and recorded on the lead's outbox.
  Response: `200 {"ok":true,"enabled":true,"checked":N,"sent":N}`.

### GET /api/crm/backup

Daily full backup, mailed as a JSON attachment. Auth: `Authorization: Bearer <CRON_SECRET>`
(Vercel Cron) **or** a valid **admin** session (manual trigger). Scheduled in `vercel.json`:
`0 3 * * *` (daily 03:00 UTC).

Takes a snapshot of all leads, all villa records + history, and the last 500 events, and
e-mails it via Resend as a `crm-backup-YYYY-MM-DD.json` attachment from `CRM_NOTIFY_FROM`
(default `Longevity CRM <onboarding@resend.dev>`) to `CRM_NOTIFY_TO`, subject
`CRM backup — YYYY-MM-DD (<n> leads)`. Any one of these snapshots can restore the CRM.

| Case | Response |
|---|---|
| `RESEND_API_KEY` or `CRM_NOTIFY_TO` unset | `503 {"ok":false,"error":"mailer not configured"}` |
| Sent | `200 {"ok":true,"sent_to":"...","bytes":N,"counts":{"leads":N,"villas":N,"events":N}}` |
| Resend rejected the send | `502 {"ok":false,"bytes":N,"counts":{...}}` |

---

## Outbound webhooks & external calls

| Target | Trigger | Payload | Failure handling |
|---|---|---|---|
| `MAKE_WEBHOOK` (make.com) | Every `POST /api/lead` after local store | The visitor's original JSON body, forwarded verbatim (`Content-Type: application/json`) | Unset → skipped with `forwarded:false`; fetch error → `502` to the caller. `/api/ingest` never forwards (loop avoidance). |
| `SHEET_WEBHOOK` (Google Sheet Apps Script) | Villa status change from the CRM UI, or a payment-driven status advance | `{"secret": SHEET_SECRET, "id", "status", "seller", "note"}` | Requires both `SHEET_WEBHOOK` and `SHEET_SECRET`. Best-effort: 4 s timeout, errors swallowed, never blocks the save. Skipped for changes arriving **from** the sheet (`/api/villa-sync` applies silently — no loop). |
| `PARTNER_WEBHOOK_URL` (3DEstate Smart Model push) | Every villa status change (CRM UI, sheet-originated via `/api/villa-sync`, or payment-driven) | `{"event":"unit.updated","id","status","price","at"}` — `status` maps `free` → `available`; `price` is the contract value or `null`; buyer identity is never exposed | Unset → skipped (the 3D twin falls back to polling `GET /api/3destate/units`). Best-effort: 4 s timeout, errors swallowed. |
| Resend (`https://api.resend.com/emails`) — operator alert | New lead created via `/api/lead` or `/api/ingest` | Branded "New lead" HTML e-mail from `CRM_NOTIFY_FROM` (default `Longevity CRM <onboarding@resend.dev>`) to `CRM_NOTIFY_TO`, subject `New <kind> — <name>` (🔥 when hot) | No-op unless `RESEND_API_KEY` + `CRM_NOTIFY_TO` set; errors swallowed. |
| Resend — customer auto e-mails | Welcome: new lead with e-mail via `/api/lead`. Reminder: `/api/crm/cron` | Plain-text-style HTML from `CRM_AUTO_FROM`, `reply_to` = `CRM_NOTIFY_TO`; welcome variant depends on `form_type` (brochure link inline for `brochure_request`; reservation copy for `reserve`/villa origins; generic thank-you otherwise), signed with `CRM_AGENT_NAME/TITLE/PHONE` or a neutral team signature | Dark by default — sends only when `RESEND_API_KEY` + `CRM_AUTO_FROM` set and `CRM_AUTO_EMAILS` ≠ `off`. 8 s timeout, never throws; only accepted sends are recorded on the lead's outbox. |
| Resend — daily backup mail | `GET /api/crm/backup` (Vercel Cron 03:00 UTC, or manual admin trigger) | Full JSON snapshot (leads, villas, villa history, last 500 events) as an attachment, from `CRM_NOTIFY_FROM` to `CRM_NOTIFY_TO` | `503` when `RESEND_API_KEY`/`CRM_NOTIFY_TO` unset; `502` when Resend rejects the send. |

## Environment variables read by the API layer

| Variable | Purpose |
|---|---|
| `MAKE_WEBHOOK` | make.com webhook URL; `/api/lead` forwards every form body there. Unset → leads are stored but not forwarded. |
| `INGEST_SECRET` | Shared secret for `POST /api/ingest` (`x-ingest-key` header or `?key=`). Unset → the endpoint always 401s. |
| `SHEET_SECRET` | Shared secret: validates inbound `/api/villa-sync` **and** is included in outbound sheet-sync payloads. |
| `SHEET_WEBHOOK` | Apps Script URL that receives villa status changes made in the CRM. Both `SHEET_WEBHOOK` and `SHEET_SECRET` must be set for sync to run. |
| `ESTATE_API_KEY` | API key for `GET /api/3destate/units` (`x-api-key` or `?key=`). Rotate by changing the env var. Unset → always 401. |
| `PARTNER_WEBHOOK_URL` | Partner (3DEstate) webhook URL — receives a `unit.updated` push on every villa status change. Unset → no push (the twin polls instead). |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `GET /api/crm/cron` and `GET /api/crm/backup`. |
| `CRM_USER` | Primary CRM account name (default `admin`). |
| `CRM_PASSWORD` | Primary CRM account password. Unset in production → primary account disabled (fails closed); dev fallback password is `longevity`. |
| `CRM_USERS` | Extra accounts, comma-separated `name:password` or `name:password:viewer` — the `viewer` suffix makes the account read-only (403 on every mutating endpoint); default role is admin. |
| `RESEND_API_KEY` | Resend API key — needed for both the operator alert and the customer auto e-mails. |
| `CRM_NOTIFY_TO` | Operator alert + daily backup recipient; also the `reply_to` of customer auto e-mails. |
| `CRM_NOTIFY_FROM` | Operator alert sender (default `Longevity CRM <onboarding@resend.dev>`). |
| `CRM_AUTO_FROM` | Sender of customer auto e-mails, e.g. `Longevity Samui <sales@longevitysamui.com>`. Unset → the whole auto-e-mail engine is inert. |
| `CRM_AUTO_EMAILS` | Kill-switch: set to `off` to disable auto e-mails even when configured. |
| `CRM_AGENT_NAME`, `CRM_AGENT_TITLE`, `CRM_AGENT_PHONE` | Signature of the auto e-mails (name, title, phone/WhatsApp link). No name → neutral team signature. |
| `DATABASE_URL` / `POSTGRES_URL` | Neon Postgres connection (either works). Present → the Postgres backend is used; absent → local JSON file backend. |
| `CRM_DATA_DIR` | Directory of the local dev JSON store (default `~/.longevity-crm`, file `db.json`). |
| `NODE_ENV` | `production` toggles the `Secure` cookie flag and disables the dev login fallback. |

## Persistence note

All routes read/write through the pluggable backend in `lib/crm/backend.ts`: Neon Postgres
over HTTP when `DATABASE_URL`/`POSTGRES_URL` is set (tables `crm_leads`, `crm_events`,
`crm_villas`, `crm_villa_history`, `crm_blocklist`, auto-created on first use; leads and
events stored as JSONB documents), otherwise a single local JSON file. Lead writes use
optimistic concurrency (`rev` counter, conditional save, retry ×4), so concurrent edits
interleave instead of overwriting each other.

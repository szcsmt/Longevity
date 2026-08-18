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
visitor's submit). Nothing is forwarded anywhere: this CRM is the only destination a lead
from this website has.

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

Note: this endpoint does **not** check the blocklist — only `/api/whatsapp` does.

Responses:

| Case | Response |
|---|---|
| Stored | `200 {"ok":true}` |
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
| `ref` | no | 16 | WhatsApp taps only — the code carried into the prefilled message, upper-cased on store |
| `locale` | no | 10 | WhatsApp taps only |
| `page_url` | no | 300 | WhatsApp taps only |
| `utm` | no | 120 each | WhatsApp taps only — object of `source`/`medium`/`campaign`/`term`/`content` |

The last four exist because a WhatsApp tap is the one click where the visitor leaves for a
channel that tells us nothing about where they came from; they are held on the event until
the inbound message claims them. See **Website tap → WhatsApp lead**.

Response: `200 {"ok":true}`.

### GET /api/unsubscribe?l=&lt;lead id&gt;

One-click opt-out from the automated e-mail sequence, linked at the foot of every automated
mail. Public and unauthenticated: the lead id **is** the token — a random UUID that only ever
appears in that person's own inbox — so no extra signature is needed, and the worst case
(someone unsubscribing themselves twice) is harmless.

Sets `unsubscribed` on the lead, logs "Customer opted out of the automated e-mails" to the
timeline, and ends the sequence for good. E-mail a person writes by hand is unaffected.

Idempotent, and always answers `200` with a friendly HTML page — even for an unknown or
missing id, so a customer never sees an error for doing what we asked them to do.

### GET /c?l=&lt;lead id&gt;&amp;t=&lt;label&gt;&amp;u=&lt;destination&gt;

Tracked click. Every button in every automated letter points here; the route records
`Clicked: <label>` on the lead's timeline, upgrades a cold lead to warm, then `302`s to the
destination. Public and unauthenticated for the same reason as the opt-out link: the lead id
is the token.

The destination is checked against an allowlist (`longevitysamui.com` and its subdomains,
`cal.com`, `app.cal.com`, `wa.me`, `api.whatsapp.com`) and anything else is refused with
`400`. Without that check this would be an open redirect — the exact shape a phishing mail
takes. Deduped within the hour, so a prefetching mail client writes one line, not five.

Document links are **not** routed through here: `/d/<id>` already records the open, and one
tap should read as one line of history.

### GET /d/&lt;document id&gt;?l=&lt;lead id&gt;

Tracked document link. Records `Opened: <title>` on the lead's timeline, then `302`s to the
real file. One open makes a lead warm, three make it hot. Deduped within the hour, because a
PDF viewer commonly re-requests a file. Without `?l=` the link still works, it is simply not
attributed — the same URL is therefore usable in a WhatsApp message or on a business card.

The library lives in `lib/crm/documents.ts`. Replacing the file behind an id updates every
letter already sitting in somebody's inbox.

| id | File | What it is |
|---|---|---|
| `overview` | `/brochure/longevity-brochure-short-2026.pdf` | 13 pages, 9.9 MB. First contact — the story cut to what a stranger needs. A 12-page, 2.6 MB cut is on disk at `/brochure/longevity-overview-2026.pdf`, kept unlinked (see the comment in `documents.ts`). |
| `brochure` | `/brochure/longevity-brochure-2026.pdf` | 52 pages, 14 MB. Held back for someone who has already shown interest. |

---

## Inbound integration endpoints

### GET · POST /api/whatsapp

Inbound WhatsApp through the Meta Cloud API — the channel that used to end on one person's
handset.

`GET` is Meta's one-time subscription handshake: echoes `hub.challenge` as plain text when
`hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`, else `403`.

`POST` is the delivery. Every request is verified against `x-hub-signature-256`
(HMAC-SHA256 of the **raw** body with `WHATSAPP_APP_SECRET`); an unverifiable delivery is
`401`ed rather than trusted. Then, per message:

1. blocked contacts are skipped silently;
2. the reference code is taken off the text (`stripWaRef`) and looked up
   (`findClickByRef`) — see **Website tap → WhatsApp lead** below;
3. an unknown number becomes a lead, a known number's message becomes a reply on the lead
   that already exists (`upsertLeadFromPayload`, one person = one lead);
4. `readReply` reads it, if `ANTHROPIC_API_KEY` is set;
5. `recordInboundReply(channel: 'whatsapp')` files it, which **stops the sequence**;
6. a brand-new lead gets the welcome back on WhatsApp (`sendAutoWelcome`), inside Meta's
   24-hour free-text window. Silent while the Cloud API env is unset;
7. the message is forwarded to `CRM_NOTIFY_TO` with the brief on top.

#### Website tap → WhatsApp lead

Meta's webhook delivers a phone number and a line of text; everything the site knew about
the visitor a second before the tap is lost at the handover. So the icon's prefilled message
carries a reference:

```
Hello, I'd like to learn more about Longevity Resort.

Ref: LR-7K2MQ4
```

The tap is logged as a `whatsapp` event under the same code (`ref`, plus `locale`,
`page_url` and the `utm` set — `lib/wa.ts` builds the link, `ReserveFab` posts the event).
When the message arrives the code is matched back within **24 hours**, and the lead is
created with that page, language and campaign on it, `form_origin: 'fab'` and
`source: 'Website WhatsApp'`; the tap goes on the timeline as `Clicked: WhatsApp from /…`.
The `Ref:` line is stripped before anything is filed, so the timeline reads as the customer
wrote it. No match (a stranger who found the number elsewhere, a visitor who deleted the
line, storage blocked in the browser) simply means `source: 'WhatsApp'` and no page context —
never a dropped message.

Always answers `200` — a non-2xx makes Meta retry, which would double-file a message we have
already accepted. Response: `{"ok":true,"messages":N,"filed":N}`. Most deliveries are status
receipts and file nothing.

### POST /api/inbound

Inbound customer e-mail (Resend `email.received`). Auth: `?key=<INBOUND_SECRET>`; unset →
always `401`. The webhook carries metadata only, so the body is fetched back from
`GET https://api.resend.com/emails/receiving/{id}` before anything is filed. Quoted history
is cut off at the first quote marker so the note shows what the person actually wrote this
time. Then the same pipeline as WhatsApp: upsert → read → file → forward.

### POST /api/booking

Cal.com booking webhook (`BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`),
verified by HMAC-SHA256 in `x-cal-signature-256` against `CAL_WEBHOOK_SECRET`. Files the
booking on the lead, marks it hot, moves `new`/`lost` → `contacted`, and drops a dated
"Call booked — be there" task with the video link on the timeline.

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
| `update` | `patch` object | Only these keys are accepted, everything else is silently dropped (attribution/history/timestamps can never be overwritten): `name`, `email`, `phone`, `whatsapp`, `villa` (strings, capped 300); `country` (ISO alpha-2 the CRM can name, empty clears it back to the dialling-code reading); `stage` (must be `new`/`contacted`/`qualified`/`presentation`/`visit`/`negotiation`/`reserved`/`contract`/`won`/`lost`); `score` (`hot`/`warm`/`cold`); `value` (`null`/`''` clears; non-negative finite number → rounded); `lost_reason` (`price`/`timing`/`competitor`/`unreachable`/`other`, `null`/`''` clears); `owner` (must be a name on the `CRM_AGENTS` roster — anything else is dropped; `null`/`''` unassigns). Stage/score/contact/value changes are logged to the timeline; moving to any stage other than `lost` clears `lost_reason`. A stage, score or contact edit also stamps `first_response_at` if it is still empty. Moving to `reserved`, `contract` or `won` on a lead with **no `villa`** is refused with **`409`** and a sentence — those three stages assert a specific unit, and without one the masterplan cannot show who holds the plot. Moving to `qualified` or beyond with qualification answers missing is allowed and the gap is written onto the timeline entry (`New → Presentation — still unknown: budget, timeframe`). |
| `addNote` | `body` (required, non-empty → else `400`) | Prepends a note (capped 4000). |
| `addTask` | `title` (required → else `400`), `due` (optional ISO) | Appends an open task (title capped 300). |
| `toggleTask` | `taskId` | Flips `done`; unknown task id → `404`. |
| `merge` | `otherId` | Folds the other lead into this one: fills blank contact/attribution fields, keeps GDPR consent if either had it, appends notes/tasks/history **and agency registrations** (deduped by id — a retried merge is idempotent; claims are re-sorted by date, because "who was first" is the whole question a claim answers), logs a `merged` activity once, then archives the other lead. `otherId === id` → `404`. |
| `awaiting` | `on` (boolean) | `true`: sets `awaiting_reply_since = now`, logs "Email sent — awaiting reply", and adds a "Follow up — no reply yet" task due in 3 days (unless one is already open). `false`: clears the flag, logs "Reply received", ticks the chase task. |
| `qualify` | `patch` object | Structured qualification. Values are validated against their option lists in the store, so a crafted payload cannot make a lead look qualified on answers nobody gave. |
| `logTouch` | `touch` (a `TOUCHES` key), `note` (optional) | Records a call / video / meeting / site visit / WhatsApp. A `reached` touch clears the reply timer, ticks the chase task, moves a `new` lead to `contacted` and stops the automated sequence; a missed one does none of that. Unknown key → `404`. |
| `outreach` | `channel` (`email`/`whatsapp`/`phone`) | Records that the channel was **opened** — never that a message was sent. `reached` stays unset. Repeats of the same channel within 10 minutes are dropped. An unknown channel returns `200 {"ignored":true}` rather than an error, because the call rides along with a navigation the operator has already started. |
| `nurture` | `until` (ISO date, future), `reason` (a `NURTURE_REASONS` id), `note` — or **no `until`** to bring the lead back | Parks the lead until the date: out of the working queue, out of the automated sequence, no stall flag, stage unchanged. Clears the reply timer. A date that is not in the future → `400`. Omitting `until` releases it. |
| `register` | `agencyId` (required), `brokerId`, `note`, `override` | Records that an agency introduced this buyer. Appends a claim carrying the agency name **as it reads today**, who recorded it, and an expiry computed from the agency's protection window. While another agency's claim is live this returns **`409`** with `{error, conflict}` naming who holds it and until when; `override: true` records over it anyway (**admin only**, `403` otherwise) and the new claim stores the id of the one it superseded. The same agency re-registering is a renewal, not a conflict. Unknown or archived agency → `400`. |
| `releaseClaim` | `claimId`, `reason` (required) | Withdraws a registration. **Admin only.** The claim stays on the record with the reason and the timestamp — it stops counting for protection and for credit, and is never removed. Missing reason or unknown claim → `400`. |

### DELETE /api/crm/leads/[id]

**Archives** the lead. Admin only. The default is reversible because the request
that looks like "get rid of this" is almost always "get this out of my way": the
lead leaves every view, count, report and the sequence, and its timeline,
attribution and ownership history all survive.

| Query | Effect |
|---|---|
| *(none)* | Archive. `200 {"ok":true,"archived":true}` |
| `?reason=…` | Archive with a reason recorded on the timeline |
| `?block=1` | Also blocklist the contact, so a future WhatsApp message never recreates the lead |
| `?purge=1` | **Permanent deletion.** Requires the lead to be archived already, else `409` with an explanation. `200 {"ok":true,"purged":true}` |

`PATCH … {"op":"unarchive"}` restores it (admin only).

There is deliberately no bulk permanent delete — the bulk action is `archive`.

`?block=1` adds the lead's contact keys (`e:<lowercased email>`, `p:<last-9-digit phone key>`
for phone and WhatsApp) to the blocklist **first**, so the person's next WhatsApp message
through `/api/whatsapp` never recreates the lead. Used for private numbers that are not real
leads, and it composes with either archiving or purging.

### GET /api/crm/leads/[id]/offer?value=&lt;THB&gt;

The reservation offer for one lead, as a printable HTML page: their name, their residence,
the price, and the house payment schedule worked out from it. Auth: session cookie, admin or
agent (`403` for viewers).

HTML rather than a generated PDF on purpose — the browser's own print dialogue makes a
better PDF than any library we would have to ship, and the operator reads it before it goes
anywhere. `?value=` overrides the catalogue price for a negotiated figure; rounding drift is
absorbed by the final instalment so the column sums to the total.

Generating one files `Offer <reference>` on the timeline (deduped within the hour), because
"did we ever send them an offer, and for how much" gets asked weeks later.

### POST /api/crm/leads/bulk

Bulk action from the leads list. Body:

| Field | Validation |
|---|---|
| `ids` | array of strings, non-strings filtered out, capped at **200**; empty → `400 "no ids"` |
| `action` | `stage` \| `score` \| `archive`; anything else → `400 "unknown action"` |
| `value` | for `stage`: a valid stage id (else `400 "bad stage"`); for `score`: `hot`/`warm`/`cold` (else `400 "bad score"`); ignored for `delete` |

Each lead is attempted independently — one failure never aborts the batch. Response:
`200 {"ok":<failed===0>,"count":<done>,"failed":<failed>,"refused":[...]}`.

`refused` carries the reason **per lead name**, deduped and capped at 8 — a stage move blocked
because the lead names no residence, or an archive blocked because the lead holds a unit.
"3 leads could not be updated" with no explanation is indistinguishable from a broken button.

### GET /api/crm/agencies

Partner agencies, alphabetical. Any signed-in session — a salesperson has to know which
agencies exist to register a buyer against one. `?archived=only|include` widens it.
Returns `{"ok":true,"agencies":[...]}` with contacts nested.

### POST /api/crm/agencies

Creates one. **Admin only.** Body: `name` (required → else `400`), `country`, `website`,
`status`, `note`. A new agency starts as `prospect` — a conversation, not a partner.

### GET · PATCH /api/crm/agencies/[id]

`GET` returns one agency (any signed-in session). `PATCH` is **admin only**: everything here
edits the commercial relationship, and a commission percentage is not a salesperson's to write.

| `op` | Body | Behaviour |
|---|---|---|
| `update` | `patch` | Accepts `name`, `country`, `website`, `note`, `status` (a `AGENCY_STATUS` id), `commission_model` (a `COMMISSION_MODELS` id), `agreement_at` (`YYYY-MM-DD`), `commission_pct` (0–100), `commission_fixed`, `protection_days`. A value not on its list leaves the stored one alone; a non-positive number clears the field; a percentage over 100 is dropped as the typo it is. A blank `name` is ignored. |
| `addContact` | `contact` `{name, email, phone, whatsapp}` | Appends a named agent. Missing name → `400`. |
| `setContactActive` | `contactId`, `active` | Marks somebody as having left, or brings them back. Contacts are **never removed** — a claim can point at somebody who left last year and has to keep reading with their name on it. |
| `addPayment` | `payment: {amount, at, reference?, against?, note?}` | Records commission actually paid. `amount` may be **negative** — that is how a mistake is corrected, because there is deliberately no way to delete one. Zero amount or an unparseable date → `400`. |
| `archive` | — | Ends the relationship. The agency leaves every picker and every report; its registrations stay on the buyers, so a sale completing next year is still credited to whoever introduced it. |
| `unarchive` | — | Restores it. |

There is deliberately **no DELETE**.

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
| `phase` | `key` (a step of **this unit's** schedule), `paid: bool`, `amount?` | Marks a payment milestone (`pct` × contract value; `amount` overrides the computed figure). Marking paid with no contract value defaults it from the list price. **Money changes availability**: first paid phase on a `free` plot → `reserved`; **every** step of the unit's schedule paid → `sold`; a payment-driven status change is logged and synced to the sheet. Unknown key → `400`. |
| `reserve` | `amount?`, `expiresAt?`, `agreement?`, `note?` | Takes the villa off the market **and** records the reservation behind it. `by` is stamped from the session, never read from the body. **Refused (`409`) without a buyer on the record.** |
| `reservationPatch` | `patch: { amount?, paidAt?, expiresAt?, agreement?, note? }` | Fills in what was not known at the time. A `paidAt` arriving writes its own line on the villa history. `null` clears a field; a value that is not a `YYYY-MM-DD` date is dropped. |
| `releaseReservation` | `reason` (required) | The hold lapsing or being cancelled: villa back to `free`, reservation record gone, the whole thing kept on the villa history with the reason. |
| `contract` | `status: "none"|"sent"|"review"|"signed"`, `note?` | The SPA. Each step stamps its own date the **first** time it is reached, so stepping back to correct a mis-click never rewrites when the contract went out. |
| `schedule` | `phases: PhaseDef[] | null` | This unit's own payment terms; `null` restores the standard ones. **Refused (`409`)** once an instalment has been paid against the schedule, and when the percentages do not add up to 100 (±0.01). |
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
`stage`, `score`, `form_type`, `source` (a canonical channel), `country` (ISO alpha-2),
`timeframe`, `minBudget` + `budgetCurrency`, `owner`, `flag` (one of the six working-queue
rules), `q` (free-text over name/e-mail/phone/villa) and `archived=only`.

Columns: `name`, `email`, `phone`, `whatsapp`, `form_type`, `form_origin`, `villa`, `stage`,
`score`, `channel` (the normalised source), `country`, `source` (the raw value), `agency`, `agency_agent`, `registered`
(the credited registration — who introduced the buyer, their named agent, and when),
`utm_medium`, `utm_campaign`, `gdpr_consent` (`yes`/`no`), `received` (`submitted_at` or
`created_at`), `notes` (count), `open_tasks` (count).

Every value originates from the public form and is treated as hostile: cells starting with
`=`, `@`, tab or CR — and `+`/`-` unless the value looks like a phone number — get a leading
`'` so Excel/Sheets never evaluates a formula; cells containing `"`, `,`, `;`, LF or CR are
quoted. Output is UTF-8 with BOM, CRLF line endings,
`Content-Disposition: attachment; filename="longevity-leads-YYYY-MM-DD.csv"`.

### GET /api/crm/cron

Daily sweep. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) **or** a valid session
cookie (manual trigger). Scheduled in `vercel.json`: `0 0 * * *` — midnight UTC, which is
**07:00 on Samui**, so the operator's day starts with the CRM having already done its round.

Two jobs in one run, deliberately: the plan allows few scheduled jobs, and these belong
together anyway — advance the customer sequence, then report to the operator on what is left
for a human.

**1. The sequence.** Advances every still-quiet lead by **at most one step** of the minute-0
→ day-60 sequence (day 3 nudge, day 10 story, day 24 viewing invite, day 45 terms, day 60
closing note — see DATA-MODEL.md for the drop-out rules). Each send is recorded on the
lead's outbox. Channel per lead: **e-mail when there is an address, WhatsApp otherwise** —
before this, a lead with a number and no address received nothing at all. A WhatsApp send
Meta refuses (the 24-hour window, usually) records nothing, so the step comes due again the
next day. Inert when both `autoEmailsEnabled()` and `whatsappEnabled()` are false.

**2. The morning digest.** Runs even when the sequence is dark — telling the operator what
needs doing has nothing to do with whether we are mailing customers. Only things a person
has to **do** today, worst first: customers waiting on a reply, overdue tasks, untouched new
leads, leads warming up (opened or clicked in the last 24 h), gone quiet, stalled, no next
step. **Nothing is sent when there is nothing to do** — that is what keeps the mail worth
opening. Recipient `CRM_DIGEST_TO` (comma-separated), falling back to `CRM_NOTIFY_TO`.

Response: `200 {"ok":true,"enabled":true,"checked":N,"sent":N,"steps":{…},"digest":{"sent":true,"total":N}}`.

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
| `SHEET_WEBHOOK` (Google Sheet Apps Script) | Villa status change from the CRM UI, or a payment-driven status advance | `{"secret": SHEET_SECRET, "id", "status", "seller", "note"}` | Requires both `SHEET_WEBHOOK` and `SHEET_SECRET`. Best-effort: 4 s timeout, errors swallowed, never blocks the save. Skipped for changes arriving **from** the sheet (`/api/villa-sync` applies silently — no loop). |
| `PARTNER_WEBHOOK_URL` (3DEstate Smart Model push) | Every villa status change (CRM UI, sheet-originated via `/api/villa-sync`, or payment-driven) | `{"event":"unit.updated","id","status","price","at"}` — `status` maps `free` → `available`; `price` is the contract value or `null`; buyer identity is never exposed | Unset → skipped (the 3D twin falls back to polling `GET /api/3destate/units`). Best-effort: 4 s timeout, errors swallowed. |
| Resend (`https://api.resend.com/emails`) — operator alert | New lead created via `/api/lead`, `/api/whatsapp` or `/api/booking` | Branded "New lead" HTML e-mail from `CRM_NOTIFY_FROM` (default `Longevity CRM <onboarding@resend.dev>`) to `CRM_NOTIFY_TO`, subject `New <kind> — <name>` (🔥 when hot) | No-op unless `RESEND_API_KEY` + `CRM_NOTIFY_TO` set; errors swallowed. |
| Resend — customer auto e-mails | Welcome: new lead with e-mail via `/api/lead`. Reminder: `/api/crm/cron` | Plain-text-style HTML from `CRM_AUTO_FROM`, `reply_to` = `CRM_NOTIFY_TO`; welcome variant depends on `form_type` (brochure link inline for `brochure_request`; reservation copy for `reserve`/villa origins; generic thank-you otherwise), signed with `CRM_AGENT_NAME/TITLE/PHONE` or a neutral team signature | Dark by default — sends only when `RESEND_API_KEY` + `CRM_AUTO_FROM` set and `CRM_AUTO_EMAILS` ≠ `off`. 8 s timeout, never throws; only accepted sends are recorded on the lead's outbox. |
| Resend — daily backup mail | `GET /api/crm/backup` (Vercel Cron 03:00 UTC, or manual admin trigger) | Full JSON snapshot (leads, villas, villa history, last 500 events) as an attachment, from `CRM_NOTIFY_FROM` to `CRM_NOTIFY_TO` | `503` when `RESEND_API_KEY`/`CRM_NOTIFY_TO` unset; `502` when Resend rejects the send. |

## Environment variables read by the API layer

| Variable | Purpose |
|---|---|
| `SHEET_SECRET` | Shared secret: validates inbound `/api/villa-sync` **and** is included in outbound sheet-sync payloads. |
| `SHEET_WEBHOOK` | Apps Script URL that receives villa status changes made in the CRM. Both `SHEET_WEBHOOK` and `SHEET_SECRET` must be set for sync to run. |
| `ESTATE_API_KEY` | API key for `GET /api/3destate/units` (`x-api-key` or `?key=`). Rotate by changing the env var. Unset → always 401. |
| `PARTNER_WEBHOOK_URL` | Partner (3DEstate) webhook URL — receives a `unit.updated` push on every villa status change. Unset → no push (the twin polls instead). |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `GET /api/crm/cron` and `GET /api/crm/backup`. |
| `CRM_USER` | Primary CRM account name (default `admin`). |
| `CRM_PASSWORD` | Primary CRM account password. Unset in production → primary account disabled (fails closed); dev fallback password is `longevity`. |
| `CRM_USERS` | Extra accounts, comma-separated. `name:password` = admin; `name:password:agent` = salesperson; `name:password:viewer` = read-only. An entry with no role stays admin, so existing accounts are unaffected. See the role table below. |
| `RESEND_WEBHOOK_SECRET` | Resend's Standard Webhooks signing secret (`whsec_…`). Set → `POST /api/inbound` requires a valid signature and the URL key is ignored. |
| `INBOUND_SECRET` | Fallback query-string secret for `POST /api/inbound` (`?key=`), used only while no signing secret is set. |
| `CRM_REPLY_TO` | The Resend inbound address customer replies should go to, e.g. `reply@….resend.app`. Set → the CRM sees replies and can stop the sequence. Unset → falls back to `CRM_NOTIFY_TO` and the CRM stays blind. |
| `CRM_DIGEST_TO` | Morning-digest recipients, comma-separated. Falls back to `CRM_NOTIFY_TO`. |
| `CRM_FX` | Exchange rates for comparing budgets, as `EUR:38,USD:35,GBP:44` — how many baht one unit is worth. **No defaults**: with nothing configured the budget filter compares within a single currency and the leads page says so, because an invented rate would make a filter look complete while hiding buyers. |
| `CRM_PAYMENT_SCHEDULE` | The project's payment schedule as JSON: an array of `{key, pct, label, gate, construction}` whose percentages add up to 100. Unset → 7 / 43 / 40 / 10. Read on the **server only**; a unit is stamped with these terms the first time money is agreed on it, so changing this never rewrites a deal already struck. An invalid value is refused rather than half-applied, and the Payments page says so. |
| `CRM_AGENCY_PROTECTION_DAYS` | How long a partner agency's registration protects its claim on a buyer, in days (default `90`). The house figure; an agency that negotiated something different carries its own `protection_days`. Deliberately configuration rather than a constant in the code. |
| `WHATSAPP_TOKEN` | Meta Cloud API permanent access token. |
| `WHATSAPP_PHONE_ID` | Meta phone **number id** (not the number itself). |
| `WHATSAPP_VERIFY_TOKEN` | Any string; also typed into Meta's webhook form. Unset → `GET /api/whatsapp` always 403s. |
| `WHATSAPP_APP_SECRET` | App secret used to verify every delivery. Unset → `POST /api/whatsapp` always 401s. |
| `WHATSAPP_API_VERSION` | Graph API version (default `v21.0`). |
| `WHATSAPP_MESSAGES` | Kill-switch: `off` disables outbound WhatsApp even when configured. |
| `ANTHROPIC_API_KEY` | Enables the reply reading. Unset → replies are still filed and the sequence still stops; only the brief is skipped. |
| `CRM_BOOKING_URL` | Cal.com booking link. Set → "Book a call" opens the calendar with name and e-mail pre-filled; unset → falls back to a `mailto:`. |
| `CAL_WEBHOOK_SECRET` | Signing secret for `POST /api/booking`. |
| `CRM_SIGNATURE_NAME`, `_TITLE`, `_PHONE`, `_EMAIL` | Set → letters are signed by the office with no personal name. The lead's owner is unchanged either way; it is simply not printed. |
| `RESEND_API_KEY` | Resend API key — needed for both the operator alert and the customer auto e-mails. |
| `CRM_NOTIFY_TO` | Operator alert + daily backup recipient; also the `reply_to` of customer auto e-mails. |
| `CRM_NOTIFY_FROM` | Operator alert sender (default `Longevity CRM <onboarding@resend.dev>`). |
| `CRM_AUTO_FROM` | Sender of customer auto e-mails, e.g. `Longevity Samui <sales@longevitysamui.com>`. Unset → the whole auto-e-mail engine is inert. |
| `CRM_AUTO_EMAILS` | Kill-switch: set to `off` to disable auto e-mails even when configured. |
| `CRM_AGENTS` | The sales roster that leads are assigned to, `;`-separated, each entry `name\|email\|phone` — e.g. `Máté Szűcs\|sales@longevitysamui.com\|+36 30 851 5927`. The owner's name and phone sign that lead's automated e-mails. |
| `CRM_AGENT_TITLE` | Job title printed under the name in the signature (applies to the whole roster). |
| `CRM_AGENT_NAME`, `CRM_AGENT_PHONE` | One-person fallback used only when `CRM_AGENTS` is empty. With neither set: no owner assignment, and a neutral team signature. |
| `DATABASE_URL` / `POSTGRES_URL` | Neon Postgres connection (either works). Present → the Postgres backend is used; absent → local JSON file backend. |
| `CRM_DATA_DIR` | Directory of the local dev JSON store (default `~/.longevity-crm`, file `db.json`). |
| `NODE_ENV` | `production` toggles the `Secure` cookie flag and disables the dev login fallback. |

## Roles

| Can | admin | agent | viewer |
|---|:--:|:--:|:--:|
| Read every lead, pipeline, masterplan, analytics | ✓ | ✓ | ✓ |
| Add leads, notes, tasks; change stage, score, owner | ✓ | ✓ | — |
| Generate an offer | ✓ | ✓ | — |
| Delete a lead (single or bulk), merge, dedupe | ✓ | — | — |
| Edit the masterplan sales ledger | ✓ | — | — |
| See the Payments view | ✓ | — | — |
| Export the CSV | ✓ | — | — |
| Run backup / cron by hand | ✓ | — | — |

Every change made by a signed-in person is stamped with their name (`by` on notes, tasks and
history entries) and shown on the timeline. Entries with nobody named were the CRM's own
doing — the sequence, an inbound reply, a tracked click.

Hiding a button is not a control: each of the admin-only rows above is refused by the API
itself, not merely absent from the screen.

## Persistence note

All routes read/write through the pluggable backend in `lib/crm/backend.ts`: Neon Postgres
over HTTP when `DATABASE_URL`/`POSTGRES_URL` is set (tables `crm_leads`, `crm_events`,
`crm_villas`, `crm_villa_history`, `crm_blocklist`, auto-created on first use; leads and
events stored as JSONB documents), otherwise a single local JSON file. Lead writes use
optimistic concurrency (`rev` counter, conditional save, retry ×4), so concurrent edits
interleave instead of overwriting each other.

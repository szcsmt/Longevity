# API & Webhook Reference

Complete reference for every HTTP endpoint under `app/api/` plus the outbound webhooks the
backend calls. Everything documented here is taken directly from the route and library source
(`app/api/**/route.ts`, `lib/crm/*.ts`, `vercel.json`).

All routes are declared `dynamic = 'force-dynamic'` — responses are never cached.

## Authentication methods

| Method | How it works | Used by |
|---|---|---|
| Public | No auth. `/api/lead` and `/api/event` are protected by a per-IP rate limit; `/api/crm/login` by a per-IP failed-attempt brake. | `/api/lead`, `/api/event`, `/api/crm/login`, `/api/crm/logout` |
| Session cookie | `lr_crm` httpOnly cookie set by `/api/crm/login`. Value is 32 random bytes, base64url — it means nothing on its own. The store (`lib/crm/sessions.ts`) holds only its SHA-256, alongside the account name, when the session began, when it was last used, and the IP and user agent it began from. Sessions expire on two clocks (idle and absolute) and can be revoked individually. | All `/api/crm/*` routes except login/logout |
| Body secret | `secret` field in the JSON body compared to `SHEET_SECRET`. Fails closed. | `/api/villa-sync` |
| `x-api-key` | Header (preferred) or `?key=` query param compared to `ESTATE_API_KEY`. Fails closed. | `/api/3destate/units` |
| `CRON_SECRET` bearer | `Authorization: Bearer <CRON_SECRET>`. A valid session cookie is accepted as an alternative (manual trigger by an operator) — any session for `/api/crm/cron`, an **admin** session for `/api/crm/backup`. | `/api/crm/cron`, `/api/crm/backup` |

Six roles exist (`lib/crm/auth.ts`) — `admin`, `head`, `agent`, `finance`, `marketing`,
`viewer` — mapped to ten capabilities in one table; routes ask for the capability they need
rather than for a role. Accounts come from `CRM_USER` + `CRM_PASSWORD` (the primary account,
always admin) merged with `CRM_USERS` (comma-separated `name:password[:role]`; an omitted or
unrecognised role means admin) and `CRM_VIEWERS` (`name:password`, always read-only).
In production a missing `CRM_PASSWORD` disables the primary account (fails closed); the
`admin`/`longevity` fallback exists only outside production.

**Password field.** Each password may be written out in full or given as an scrypt hash in
the form `scrypt$<salt-hex>$<key-hex>`, produced by `node scripts/crm-hash.mjs`. Both are
accepted, so hashing is per account and never a lock-out. A malformed hash fails closed
rather than being compared as plaintext. Comparison is constant-time either way, and the
scan continues past a match so that a wrong username and a wrong password cost the same.

### Session lifetime

| Setting | Env | Default | What it ends |
|---|---|---|---|
| Idle | `CRM_SESSION_IDLE_HOURS` | 12 h | A session nobody came back to — the unlocked laptop in the office. |
| Absolute | `CRM_SESSION_DAYS` | 7 days | A session nobody left — a token still valid weeks later is a second password. |

`seen` is refreshed at most every 5 minutes, so keeping a session alive does not mean a
database write per page view. Expired rows are pruned on every write; the history of who
was signed in lives in the audit log, not here.

## Rate limits

Only the two fully public intake endpoints are rate limited. Both limits are in-memory
**per serverless instance** (best-effort, not global), keyed on the first entry of
`x-forwarded-for`; the map is cleared when it exceeds 5000 IPs.

| Endpoint | Limit | On excess |
|---|---|---|
| `POST /api/lead` | 5 requests / minute / IP | `429 {"ok":false}` |
| `POST /api/event` | 30 requests / minute / IP | `429 {"ok":false}` |
| `POST /api/crm/login` | `CRM_LOGIN_MAX_FAILS` (8) per address **and** `CRM_LOGIN_ACCOUNT_MAX` (12) per account name, both within `CRM_LOGIN_WINDOW_MIN` (10) minutes | `429` with `Retry-After`, and a `retryAfter` in seconds in the body |

The login limit is shared across instances (`lib/crm/login-guard.ts`, stored under
`crm_login_guard`), not held per instance in memory: on a serverless deployment a per-instance
count hands an attacker the limit again on every instance, and the harder they push the more
instances they get.

**Two counters, either of which locks.** By address, for one machine working through a
password list. By account name, for the shape that actually threatens a small CRM — many
addresses trying one username once each, which no per-address counter can see.

Lockouts start at `CRM_LOGIN_LOCK_MIN` (15 minutes) and double on repetition to a cap of a
day. A stale strike ages out rather than accumulating, and a correct password clears both
counters for that address and that account.

**It fails open when the store is unreachable.** That is deliberate rather than an oversight:
the login cannot succeed without the same store, because it has to write a session, so failing
closed would lock everybody out of a CRM that is already down and protect nothing that was not
already unreachable.

## Response headers

Set in `next.config.ts` for every response: `Strict-Transport-Security: max-age=63072000;
includeSubDomains` (no `preload` — that is a submission to a list baked into browsers and far
harder to undo than to add), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies: none`, and a
`Permissions-Policy` switching off camera, microphone, geolocation, payment and USB.
`/admin/*` additionally gets `X-Frame-Options: DENY`.

### Content Security Policy

Built per request in `middleware.ts`, because it carries a nonce. Two policies, because this
deployment is two applications on one domain.

**`/admin`, `/api/crm`, `/portal`, `/api/partners`** get the strict one:

```
default-src 'self'; script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
connect-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none';
object-src 'none'; base-uri 'none'; upgrade-insecure-requests
```

`connect-src 'self'` is the clause that matters: nothing running on a CRM page can post the
lead list anywhere. The nonce is set on the *request* headers as well as the response, which
is how Next finds it and stamps it onto its own scripts — setting it only on the response
produces a correct-looking policy that blocks the app's own hydration.

Inline **styles** stay allowed. Tailwind and the CRM's components write style attributes
throughout, and a style attribute cannot exfiltrate anything; scripts are where the risk is
and scripts are locked.

**Everything else** — the marketing site — gets `frame-ancestors 'self'; object-src 'none';
base-uri 'self'; upgrade-insecure-requests` and no script restriction. It runs Google Tag
Manager, whose entire job is loading third-party tags nobody enumerated in advance, plus
Leaflet map tiles and the 3D tour launcher. Locking `script-src` there would break marketing
on the day it shipped.

Google's tags render from `components/site-tags.tsx`, which returns `null` under `/admin` and
`/portal`. They used to live in the root layout, which every route inherits, so GTM was also
running on pages listing buyers by name, e-mail and phone. The CSP now makes that a rule
rather than a habit: if they creep back into a shared layout, the CRM breaks rather than
quietly leaking.

## The nightly backup

`GET /api/crm/backup`, run by Vercel Cron or by an admin, mails a full snapshot to
`CRM_NOTIFY_TO`.

**What is in it:** every lead including archived ones, the masterplan and its history, the
last 500 interaction events, the project board, every agency including archived ones, and
the blocked contacts.

**What is deliberately not:** the settings. That corner holds the Gmail refresh token, the
live sessions and the access log — credentials and audit rather than the business's
records. A backup should be something you can hand to whoever is rebuilding the system
without also handing them the keys, and everything left out is re-established by signing
in again.

**The file.** With `CRM_BACKUP_KEY` set the attachment is `crm-backup-<date>.lrb`:

```
LRCRM1.<salt-hex:32>.<iv-hex:24>.<tag-hex:32>
<base64 ciphertext, wrapped at 76 columns>
```

scrypt for the key, AES-256-GCM for the payload, both from Node's own crypto — a backup
format whose first step is "install this library" is one that fails on the day you need
it, on a laptop that is not the usual one. GCM rather than CBC so a truncated or edited
file is refused rather than half-decoded into plausible nonsense. Every field is a fixed
width and the reader strips all whitespace first, because mail clients rewrap long lines
and the header is ninety-seven characters — long enough to be broken in half by one.

Without a key the attachment is plain `.json` and the subject line begins `⚠`.

### Restoring one

```
npm run restore -- crm-backup-2026-08-31.lrb                 # report only, writes nothing
npm run restore -- crm-backup-2026-08-31.lrb --apply         # add what is missing
npm run restore -- crm-backup-2026-08-31.lrb --apply --overwrite
npm run restore -- crm-backup-2026-08-31.lrb --out=plain.json # decrypt and stop
```

The passphrase comes from `CRM_BACKUP_KEY` or `--key=`. It writes through the same backend
interface the app uses, so it restores into Postgres or the local JSON file depending on
whether `DATABASE_URL` is set — and it prints which before doing anything, because the
mistake that costs the most here is not a failed restore but a successful one into the
wrong place. Leads, villas, history, events, notes and agencies are matched on id, so
running it twice adds nothing the second time.

## Testing the permission gates

`tests/permissions.test.ts` drives the real route handlers rather than the store beneath
them. It mints a real session for each of the six roles, puts the token in the cookie jar
`cookies()` reads (`tests/loader.mjs` stubs it from `globalThis.__lrCookies`), and asserts the
status that comes back.

Covering **48 of the 55 permission checks across 15 of the 19 routes** that have them. The
four uncovered are the two OAuth callbacks, the Google connect redirect and the cron — gated
by a nonce or a bearer token rather than by a role.

`401` and `403` are asserted apart on purpose. "Sign in" is something a caller can act on and
"you may not" is not; a route that conflates them sends one of the two somewhere that cannot
help. Both conflations existed when these tests were written and both are fixed.

## Error alerting

`lib/crm/alert.ts`, wired to Next's `onRequestError` in `instrumentation.ts`. Every server
error — a page that failed to render, a route that threw, a database that stopped answering —
is mailed to `CRM_ALERT_TO`. The nightly sweep reports whichever integration failed instead of
swallowing it, and a backup the mailer refused raises one too.

**It does not touch the database.** The most important thing it will ever report is the
database being unreachable, so the throttle is in memory — which on a serverless deployment
means per instance. A few instances may each send one mail about the same outage; that is a
far better failure than a throttle that cannot run.

**It does not go through `lib/crm/mailer`.** That module is the customer mail engine: it
refuses to send without `CRM_AUTO_FROM` and stops entirely on `CRM_AUTO_EMAILS=off`. Both are
right for letters to buyers and both would silently disable the alarm.

**It does not flood.** Occurrences are collapsed by a signature that strips ids and numbers
out of the message, so a thousand requests failing on a thousand different lead ids is one
problem rather than a thousand. The same problem is mailed once per `CRM_ALERT_QUIET_MIN`
carrying its own count; distinct problems are capped at `CRM_ALERT_MAX` per window and the
mail says how many were held back.

Nothing here throws. A reporting hook that breaks turns one failed request into two.

## Audit log

`lib/crm/audit.ts`. Every event that moves data out of the system is recorded with the
account, the IP, the browser and a one-line detail: `login`, `login.failed`, `logout`,
`session.revoked`, `export.csv`, `backup.mailed`, `leads.purge`, `settings.changed`.

Stored in the settings key-value corner, one key per month (`crm_audit_YYYY-MM`), newest
first, capped at `CRM_AUDIT_MAX` (5000) entries per month. A month is a natural retention
unit, it keeps each document small enough that appending is cheap, and old months age out by
never being written to again — no pruning job, and nothing silently deleted. Readers walk
back six months. Writing never throws into a request: losing the note that somebody was let
in is better than refusing to let them in because the note failed.

Visible at `/admin/security` (admin only), alongside the live session list.

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

## Partner portal (`/portal`, agency cookie)

A way for an introducing agency to register a buyer themselves and follow the ones they
introduced — **without** giving them a CRM login. Written from one assumption: a partner is not
staff, they are a third party with a commercial interest in our customer list, and the portal
must be useful to them without becoming a window into it.

**The credential.** One access code per agency, not an account per person: an agency is a firm we
have an agreement with, its people change, and issuing logins to each of them would be a user
directory we then have to run. The code is generated once, shown once, and stored **only as a
SHA-256**. The session signature is derived from that hash, so **re-issuing a code invalidates
every session opened with the old one** — revoking access is one click and needs no session store
to sweep. Archiving an agency kills its access too: ending a relationship has to end what came
with it.

Cookie `lr_partner` = `<base64url(agencyId)>.<sha256(id:tokenHash:salt)>`, httpOnly, `SameSite=Lax`,
14 days — deliberately shorter than a staff session.

### POST /api/partners/login

Body `{ "token": "…" }`. **8 requests / minute / IP**, then `429`. Every failure — wrong code,
revoked code, archived agency — returns the same `401` and the same sentence: saying which it was
tells somebody whether the code ever existed.

### POST /api/partners/logout

Clears the cookie.

### POST /api/partners/register

Registers a buyer against the signed-in agency. **6 requests / minute / agency**, then `429`.
Body: `name` (required), `email` / `phone` (at least one required), `whatsapp`, `villa`,
`broker`, `note`.

It goes through **the same `upsertLeadFromPayload` gate as every website form**. That is the
point: if we already know this person the registration attaches to the record that exists rather
than starting a second one beside it — the duplicate an agency portal would otherwise create
every week.

| | |
|---|---|
| `200 {"ok":true,"created":<bool>}` | Registered. `created` says whether the buyer was new to us |
| `400` | No name, or neither an e-mail nor a phone — without one we cannot tell whether we already know them |
| `409 {"error":"This buyer is already registered with us by another partner.","until":"<date>"}` | Somebody else holds the claim. **The other agency is never named** — that is their business, and a portal that names them turns a protection window into a leak. The date is shared, because it is what tells this agency when they may try again |

### What the portal shows

Only the leads the agency is **credited** with (its first registration, never withdrawn) — never
another agency's buyer, never one who came to us directly, never an archived lead, and never a
claim it recorded *over* somebody else's introduction. Per buyer: the name, the date registered,
the protection expiry, the residence and the agent they named, and a status in **five words** —
`registered`, `in progress`, `reserved`, `completed`, `closed`. Our ten-stage pipeline is how we
work a deal and is not theirs; publishing it invites arguments about why a buyer is "only" at
Presentation.

`PartnerLeadView` is an explicit type for exactly that reason: adding a field to the portal has
to be a decision somebody makes.

### Granting access

`PATCH /api/crm/agencies/[id]` with `op: "openPortal"` (returns `token` **once**) or
`op: "closePortal"`. Both need `partners.write` — i.e. the owner. `/portal` is in `robots.txt`
`disallow`: it is a door for people who were given a key, not a page anybody should arrive at
from a search.

## CRM admin endpoints (session cookie)

All routes below return `401 {"ok":false}` without a valid `lr_crm` session cookie
(except login/logout). Mutating routes — `POST /api/crm/leads`, `PATCH`/`DELETE
/api/crm/leads/[id]`, `POST /api/crm/leads/bulk`, `PATCH /api/crm/villas` and
`POST /api/crm/dedupe` — additionally require an **admin** session; a viewer session gets
`403 {"ok":false,"error":"read-only account"}`.

### POST /api/crm/login

Public. Body: `{ "username": "...", "password": "..." }`. Credentials are checked in constant
time against every configured account (the scan continues even after a match). On success
mints a session and sets the `lr_crm` cookie: httpOnly, `SameSite=Lax`, path `/`, `Secure` in
production, 30-day max-age — the cookie's max-age is only browser housekeeping, the session
store decides when the token stops working and is always stricter.

Both outcomes are written to the audit log with the caller's IP and user agent. The attempted
username is recorded on a failure; the attempted password is not, because a mistyped password
is very often somebody's real one.

Responses: `200 {"ok":true}`, `401 {"ok":false,"error":"invalid credentials"}`, or
`429 {"ok":false,"error":"too many attempts — wait a few minutes"}`.

### POST /api/crm/logout

Ends the session server-side and deletes the `lr_crm` cookie. Always `200 {"ok":true}`.
Ending it server-side is the half that matters: deleting a cookie only asks a browser to
forget a token, and the token used to stay valid regardless.

### PATCH /api/crm/leads/[id] · `op: "whatsapp"`

Sends a free-text WhatsApp from the company number and files it on the lead. Body:
`{ "op": "whatsapp", "text": "…" }`. Requires `leads.write`.

On success the message is appended to the lead's history as a `whatsapp` entry, the reply
timer starts, the answer clock stops and a `new` lead moves to `contacted` — the same four
consequences a sent e-mail has, because it is the same event through a different pipe.

Nothing is written unless Meta accepted it. A timeline saying a buyer was answered when they
were not is worse than an empty one: somebody reads it, believes it, and moves on.

`400` with a `result` field naming the reason:

| `result` | Meaning |
|---|---|
| `no-number` | The lead has no usable phone or WhatsApp number. Refused before the network. |
| `disabled` | `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` are not set, or `WHATSAPP_MESSAGES=off`. |
| `refused` | Meta rejected it — almost always the 24-hour rule below, occasionally an empty body. |

**Meta's 24-hour window.** Outside 24 hours from the customer's *own* last WhatsApp message,
only a pre-approved template may be sent and free text is refused. `Lead.wa_last_inbound`
records when they last wrote, set by the inbound webhook, and `waWindowOpen(lead)` in
`lib/crm/rules.ts` answers the question — pure, and in `rules` rather than the store, because
the lead page asks it while somebody is typing. Being told *afterwards* that a message did not
go is how people go back to sending from their own handset, which is the thing this exists to
stop.

### POST /api/crm/sessions

**Admin only** (`403 {"ok":false}` otherwise). Revokes sessions. Body is either
`{ "id": "<session id>" }` for one device or `{ "user": "<account name>" }` for every device
belonging to one person — the thing to do the hour somebody leaves. Returns
`200 {"ok":true,"revoked":<n>}`, or `400 {"ok":false,"error":"id or user required"}`.
Recorded in the audit log.

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
| `releaseReservation` | `reason` (required) | The hold lapsing or being cancelled: villa back to `free` and **every trace of the deal cleared** — buyer link, contract value, phases, schedule, contract state — the same clearing a manual status change to `free` does. The whole thing is kept on the villa history with the reason. Pushes `unit.updated` with `status: "available"`. |
| `contract` | `status: "none"|"sent"|"review"|"signed"`, `note?` | The SPA. Each step stamps its own date the **first** time it is reached, so stepping back to correct a mis-click never rewrites when the contract went out. |
| `extraAdd` | `label`, `price?` | Records what a buyer **asked for**. It starts **pending**: typing an extra in is a request, not an agreement, and `requested_by` is stamped from the session. |
| `extraDecide` | `extraId`, `approve: bool`, `reason?` | The answer. **Needs `deals.approve` — the owner alone**: approving commits the developer to building something at that price. Deciding again replaces the previous answer rather than leaving both stamps on the record. |
| `phaseDue` | `key`, `due: "YYYY-MM-DD" \| null` | The date an instalment was **agreed** to fall due. Most carry none — the schedule is governed by progress on site — and one that does is the only way a payment can be late before the building work is near it. |
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

### GET /admin/search?q=…

Not an API route — a page. Searches leads (name, e-mail, phone, WhatsApp, residence),
agencies (their name, their country, **and the people who work there**) and units (number,
buyer). Phone numbers match on their **last nine digits**, the same `phoneKey` rule duplicate
detection uses, so formatting and country codes do not matter. Archived leads and agencies are
included and labelled. Queries under two characters return nothing.

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
| `CRM_USERS` | Extra accounts, comma-separated. `name:password` = admin; `name:password:agent` = salesperson; `name:password:viewer` = read-only. An entry with no role stays admin, so existing accounts are unaffected. The password may be an scrypt hash (`scrypt$…$…`) instead of the password itself — see **Password field** above. See the role table below. |
| `CRM_ADMINS` | Owner accounts, comma-separated `name:password`. Its own variable rather than a role inside `CRM_USERS` for the same reason `CRM_VIEWERS` is: these are stored as **sensitive** values that Vercel will not read back, so adding one account to a shared list means retyping every account it already holds from memory — and a slip there costs somebody their login. One short variable per kind of account makes adding somebody a safe operation instead of a careful one. |
| `CRM_VIEWERS` | Read-only guest accounts, comma-separated `name:password`. Separate from `CRM_USERS` so that adding a guest is one short value rather than an edit to the list holding every working account. |
| `CRM_SESSION_DAYS` | Absolute session lifetime in days (default `7`). A token still valid weeks after it was issued is not a session, it is a second password. |
| `CRM_SESSION_IDLE_HOURS` | Idle session lifetime in hours (default `12`) — what ends the session on the office laptop nobody locked. |
| `CRM_LOGIN_MAX_FAILS` | Failed sign-ins from one address before it is locked out (default `8`). |
| `CRM_LOGIN_ACCOUNT_MAX` | Failed sign-ins against one account name, from any address, before that account is locked (default `12`). |
| `CRM_LOGIN_WINDOW_MIN` | The window those failures are counted in, in minutes (default `10`). |
| `CRM_LOGIN_LOCK_MIN` | The first lockout, in minutes (default `15`). It doubles on repetition, capped at a day. |
| `CRM_AUDIT_MAX` | Audit entries kept per month (default `5000`). |
| `CRM_ALERT_TO` | Where server errors are mailed. Falls back to `CRM_NOTIFY_TO`; with neither set, alerting is silent. |
| `CRM_ALERT_QUIET_MIN` | Minutes before the same problem is mailed again (default `60`). |
| `CRM_ALERT_MAX` | Distinct problems mailed per window (default `6`). Beyond it the count is carried in the next mail rather than sent as more mail. |
| `CRM_PAGE_SIZE` | Leads shown per page on `/admin/leads` (default `50`, floor `10`). Changing a filter or the sort returns to page one; an out-of-range `?page=` lands on the last page rather than on nothing. |
| `CRM_BACKUP_KEY` | Passphrase the nightly backup is encrypted with. Unset → the backup still goes out (a missing backup is worse than a readable one) but says so loudly, in the subject line and the mail body. **Keep a copy outside Vercel**: the day you need a backup may well be a day the Vercel account is part of the problem. |
| `NEXT_PUBLIC_CRM_REFRESH_SECONDS` | How often an open CRM screen re-reads itself, in seconds (default `60`). It only fires when the tab is in front and somebody has touched it recently, so this is a ceiling on how stale a watched screen gets, not a polling budget. Public for the same reason as the stage thresholds. |
| `NEXT_PUBLIC_CRM_IDLE_MINUTES` | Minutes without a click or a keystroke before the refresh stops altogether (default `10`). A visible tab is not the same as somebody working, and the tab open all night is the case that cost the money. |
| `RESEND_WEBHOOK_SECRET` | Resend's Standard Webhooks signing secret (`whsec_…`). Set → `POST /api/inbound` requires a valid signature and the URL key is ignored. |
| `INBOUND_SECRET` | Fallback query-string secret for `POST /api/inbound` (`?key=`), used only while no signing secret is set. |
| `CRM_REPLY_TO` | The Resend inbound address customer replies should go to, e.g. `reply@….resend.app`. Set → the CRM sees replies and can stop the sequence. Unset → falls back to `CRM_NOTIFY_TO` and the CRM stays blind. |
| `CRM_DIGEST_TO` | Morning-digest recipients, comma-separated. Falls back to `CRM_NOTIFY_TO`. |
| `NEXT_PUBLIC_CRM_STAGE_DAYS` | Stage stall thresholds, as `new:1,contacted:3,qualified:7`. Anything left out keeps its default; `0` removes a stage's threshold entirely. **NEXT_PUBLIC_**, because the same rule runs in the browser — the leads table decides what is stalled without asking the server, and a threshold that differed between the two would flag a lead in the list and not in the report. The price is that a change needs a redeploy. |
| `NEXT_PUBLIC_CRM_REPLY_DAYS` | Days of silence after an e-mail before a lead (and its plot) is flagged. Default `3`. Public for the same reason as above. |
| `NEXT_PUBLIC_CRM_ANSWER_HOURS` | Hours **we** have to answer once a customer writes. Default `24`. The mirror of the reply timer, and the half that costs money: a buyer who writes and waits three days has already started reading somebody else's brochure. |
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

## Roles and capabilities

Six roles, set in `CRM_USERS` as `name:password:role`. An entry with no role — or with a role
name the CRM does not recognise — is an **admin**, which keeps every account working exactly as
it did before roles existed and means a typo never silently locks somebody out of their own CRM.

| Role | What it is |
|---|---|
| `admin` | The owner of the business. Everything. |
| `head` | Head of sales. Works leads like an agent, and additionally reassigns, merges, archives, exports and sees the money. Not the commission agreements. |
| `agent` | A salesperson. Works leads all day; cannot delete one, take one off a colleague, touch the ledger or export the list. |
| `finance` | The ledger and nothing else — payments, reservations, contracts, schedules. Does not work leads. |
| `marketing` | Attribution and campaigns, deliberately **without** the money. |
| `viewer` | Reads everything, changes nothing — guests, investors, auditors. |

Routes ask for a **capability**, not a role. Adding a role is editing one table rather than
auditing every route, and a route reads as the decision it is guarding.

| Capability | admin | head | agent | finance | marketing | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `leads.write` — notes, tasks, stages, qualification, logged contact, registrations | ✓ | ✓ | ✓ | — | — | — |
| `leads.reassign` — move a lead that already belongs to somebody else | ✓ | ✓ | — | — | — | — |
| `leads.merge` — fold two records together, and the duplicate sweep | ✓ | ✓ | — | — | — | — |
| `leads.archive` — out of every view, reversibly | ✓ | ✓ | — | — | — | — |
| `leads.purge` — the real erasure | ✓ | — | — | — | — | — |
| `leads.export` — every contact we hold, in one file | ✓ | ✓ | — | — | — | — |
| `money.read` — contract values, payments, commission | ✓ | ✓ | — | ✓ | — | ✓ |
| `money.write` — the masterplan ledger | ✓ | — | — | ✓ | — | — |
| `partners.write` — agency records, commission terms, overriding a claim | ✓ | — | — | — | — | — |
| `deals.approve` — saying yes to what a buyer asked for, and what it costs | ✓ | — | — | — | — | — |

Reading every lead, the pipeline, the masterplan and the analytics needs no capability at all —
any signed-in session may.

Three distinctions worth spelling out:

- **Archiving is not purging.** Setting a lead aside is reversible and belongs to whoever runs
  the team; destroying its history does not and stays with the owner. `DELETE` asks for whichever
  one the request is actually making.
- **Picking up a lead is not taking one.** An agent may claim a lead nobody owns — that is
  somebody stepping in, and refusing it would leave the lead sitting there. Moving one that
  already belongs to another salesperson needs `leads.reassign`, and the owner control on the
  lead page is **disabled** rather than refused on save, so nobody discovers the rule by having
  a change rejected.
- **A viewer sees the money; marketing does not.** Viewers are investors and auditors, and they
  already read the masterplan ledger. Marketing is the one role the figures are hidden from —
  what a campaign produced in buyers is their business, what those buyers are worth is not.

`roleCan()` fails **closed** on a role it does not recognise rather than throwing: an exception
in a permission function becomes a 500 on a route that should simply have said no.

Legal appears in the specification and not here, because there is nothing yet for it to do that
`viewer` does not already cover. A role with no powers of its own is a label pretending to be a
permission.

Every change made by a signed-in person is stamped with their name (`by` on notes, tasks and
history entries) and shown on the timeline. Entries with nobody named were the CRM's own
doing — the sequence, an inbound reply, a tracked click.

Hiding a button is not a control: every capability above is refused by the API itself, not
merely absent from the screen. The screen hides what it can so nobody meets a refusal they
could not have predicted — the Payments page is out of marketing's menu entirely.

## Reads per render

`lib/crm/store.ts` wraps the three whole-table reads — `allLeads`, `getVillas`,
`getVillaHistory` — in React's `cache()`, which scopes them to one request: the first
caller runs the query, the rest get the same promise, and the next request starts clean.
It deduplicates across a layout AND the page rendered inside it, which passing arguments
cannot do, because those are separate renders.

Measured on `/admin/today`: **24 backend reads per render before, 2 after.**

The one hazard is a request that writes and then reads: it must not be handed the copy
from before its own write. Exactly one caller does that — `villaTxn`, which returns the
new masterplan at the end of a transaction — and it asks for `getVillaData({ fresh: true })`
by name. Anything else added later that writes and then reads a whole table must do the
same.

Outside a request (the test suite) React declines to cache and calls straight through, so
tests always see current data.

## Persistence note

All routes read/write through the pluggable backend in `lib/crm/backend.ts`: Neon Postgres
over HTTP when `DATABASE_URL`/`POSTGRES_URL` is set (tables `crm_leads`, `crm_events`,
`crm_villas`, `crm_villa_history`, `crm_blocklist`, auto-created on first use; leads and
events stored as JSONB documents), otherwise a single local JSON file. Lead writes use
optimistic concurrency (`rev` counter, conditional save, retry ×4), so concurrent edits
interleave instead of overwriting each other.

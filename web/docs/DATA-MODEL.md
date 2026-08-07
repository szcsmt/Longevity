# CRM Data Model

The domain layer lives in `lib/crm/` (types in `types.ts`, all reads/writes in `store.ts`, pure
rules in `rules.ts`). Persistence is pluggable behind the `Backend` interface (`backend.ts`):
with `DATABASE_URL` / `POSTGRES_URL` set, Neon Postgres over HTTP (`backend-pg.ts`); otherwise a
local JSON file (`backend-file.ts`, default `~/.longevity-crm/db.json`, overridable with
`CRM_DATA_DIR`). Both backends store leads and events as whole JSON documents keyed by id;
filtering happens in JS in the domain layer. The store starts empty — only real form
submissions and real site clicks create data.

Postgres tables (created lazily by `backend-pg.ts`):

| Table | Contents |
|---|---|
| `crm_leads` | `id text PK`, `data jsonb` (the whole Lead), `created_at timestamptz` |
| `crm_events` | `id text PK`, `data jsonb`, `at timestamptz` |
| `crm_villas` | `id text PK`, `status text`, `data jsonb` (the whole VillaRecord), `updated_at` |
| `crm_villa_history` | `id text PK`, `entry jsonb`, `at timestamptz` |
| `crm_blocklist` | `key text PK`, `added_at timestamptz` |

Notes, tasks, activities and sent e-mails are **embedded in the Lead document** — they are not
separate tables.

Inbound lead strings (contact/attribution fields, note bodies, task titles) pass through
`cleanText()` (strips control characters, NUL and lone surrogates — things Postgres `jsonb`
cannot store); villa seller/note/extras and event fields are only trimmed/length-capped, not
cleaned. Length caps: contact/attribution fields 300 chars, note bodies 4000, task titles 300,
villa seller 120, villa note 500.

---

## Lead

One row per person in the pipeline (see the "one person = one lead" invariant below). Created
by the public form intake (`/api/lead`), the authenticated ingest webhook (`/api/ingest`,
WhatsApp/Bigin via make.com), or manually from the admin UI (`/api/crm/leads`).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `randomUUID()` |
| `name`, `email`, `phone`, `whatsapp` | string? | Contact details |
| `form_type` | string? | `enquiry` \| `reserve` \| `brochure_request` \| `whatsapp` \| `manual` |
| `form_origin` | string? | Where the form was opened: `fab`, `investment`, `villa: Residence L`, `bigin`, or the manual source (`phone`, `referral`, …) |
| `villa` | string? | Free-text villa interest, matched to the catalogue by `villaByName()` |
| `gdpr_consent` | boolean? | Consent checkbox; treated as evidence — a merge never loses it |
| `value` | number? | Expected deal value in THB. Defaults from the villa list price (`villaByName(lead.villa)?.price`) at creation and on upsert when still empty |
| `owner` | string? | The agent who owns the lead. Assigned at intake by `pickOwner()` (`agents.ts`) from the `CRM_AGENTS` roster; signs every automated e-mail. Empty when no roster is configured |
| `first_response_at` | string? | ISO instant of the first **human** action on the lead (note, task, stage/score move, arming the reply timer). Automated e-mails deliberately don't count — this is the speed-to-lead measurement on the analytics page |
| `awaiting_reply_since` | string? | ISO instant set when an e-mail/offer went out and we wait on the customer. Cleared by an inbound message or by the operator. After `REPLY_FLAG_DAYS = 3` quiet days the lead (and its linked plot) shows a red flag |
| `lost_reason` | string? | One of the `LOST_REASONS` ids (below). Feeds reporting; the free-text detail lives in a `"Lost: …"` note. Cleared when the lead leaves `lost` |
| `outbox` | SentEmail[]? | Automated e-mails actually sent. Drives the sequence logic and renders on the timeline |
| `unsubscribed` | boolean? | The customer used the opt-out link at the foot of an automated e-mail (`GET /api/unsubscribe?l=<id>`). Ends the sequence for good; e-mail a person writes by hand is unaffected |
| `utm_source/_medium/_campaign/_term/_content` | string? | Attribution |
| `source` | string? | Campaign/channel source (`?source=`, `WhatsApp`, manual source, …) |
| `page_url` | string? | Page the form was submitted from |
| `submitted_at` | string? | ISO; from the payload, else creation time |
| `stage` | Stage | `new` \| `contacted` \| `qualified` \| `reserved` \| `won` \| `lost` |
| `score` | Score | `hot` \| `warm` \| `cold` — auto-computed at intake by `scoring.ts` |
| `notes` | Note[] | Newest first (prepended) |
| `tasks` | Task[] | Appended |
| `history` | Activity[]? | Audit trail; absent on leads created before v2 |
| `created_at`, `updated_at` | string | ISO |
| `rev` | number? | Optimistic-concurrency revision; absent on pre-v3 leads (treated as 0) |

`LeadPatch` (the only externally patchable keys, enforced by
`/api/crm/leads/[id]`): `name`, `email`, `phone`, `whatsapp`, `villa`, `stage`, `score`,
`value`, `lost_reason`. Everything else in a PATCH payload is dropped, so attribution, history
and timestamps cannot be overwritten from the outside.

### Optimistic locking (`rev`)

Every mutation goes through `mutate()` in `store.ts`: read the lead, apply the change, set
`updated_at`, bump `rev = expectedRev + 1`, then call `backend.saveLead(lead, expectedRev)`.
The backend persists **only if the stored rev still equals `expectedRev`** (Postgres:
`WHERE COALESCE((data->>'rev')::int, 0) = expectedRev`; file backend: same check under a
serialized write lock). A lost race returns false; the domain layer re-reads and retries up to
4 attempts, then throws `too many concurrent updates`. Concurrent edits interleave instead of
silently overwriting each other.

## Note

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `body` | string | Cleaned, max 4000 chars |
| `at` | string | ISO |

Special convention: a note whose body starts with `"Lost:"` carries the free-text lost detail;
the reports page collects these (`reports().lostReasons`).

## Task

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `title` | string | Max 300 chars |
| `due` | string? | ISO date; overdue is compared by **calendar date** (`due.slice(0,10) < today`), not instant |
| `done` | boolean | |
| `at` | string | ISO created |

A reserved title, `"Follow up — no reply yet"`, is the auto-created chase task of the
awaiting-reply flow (due 3 days out); it is auto-completed when the reply arrives.

## Activity (lead audit trail)

Recorded by the store whenever the lead itself changes; shown merged with notes on the
timeline.

| `kind` | Written when |
|---|---|
| `created` | Lead created (`"Lead received from the website"` / `"Added manually (<source>)"`) |
| `stage` | Stage moved (`"New → Contacted"`, `"Lost → New (re-engaged)"`) |
| `score` | Score changed (manual edit or hotter inbound signal) |
| `contact` | Contact details edited (lists the changed keys) |
| `value` | Deal value set or cleared |
| `merged` | A duplicate lead was folded in |
| `email` | Auto-email sent, "Email sent — awaiting reply", "Reply received", "Customer opted out of the automated e-mails" |
| `message` | New inbound form/WhatsApp message landed on the lead |
| `assigned` | The lead got an owner (at intake, on a later contact, or by hand) |

Fields: `id`, `kind`, `detail` (human line), `at`.

## SentEmail

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `step` | `EmailStep` | `welcome` \| `reminder` \| `story` \| `viewing` \| `terms` \| `closing` |
| `subject` | string | As sent |
| `at` | string | ISO |

### The sequence

Dark until `RESEND_API_KEY` + `CRM_AUTO_FROM` are set and `CRM_AUTO_EMAILS !== 'off'`.
Three modules split the work: `sequence.ts` holds the timetable and the "is this lead still
in the sequence?" decision (pure — the admin UI renders the same call the engine obeys, so
the screen and the engine cannot disagree), `letters.ts` holds the copy, `automation.ts` is
the engine.

| Step | Day | What it is |
|---|---|---|
| `welcome` | 0 | Thank-you, personalised to the form type (brochure / reservation / general). Sent by the **intake**, not the cron; never for a returning contact |
| `reminder` | 3 | One gentle nudge |
| `story` | 10 | What Longevity is — a reason to care again |
| `viewing` | 24 | Invitation to visit, in person or by video |
| `terms` | 45 | Pricing and the 7/43/40/10 payment schedule |
| `closing` | 60 | A graceful last word — then the engine stops |

Each letter is signed by the lead's `owner` (name, title, phone, WhatsApp link) and carries
an opt-out link. The daily sweep advances a lead by **at most one step per run** — several
steps coming due at once (after a cron outage) sends only the latest, never a burst.

A lead drops out of the sequence when any of these is true: it has no e-mail, `unsubscribed`
is set, the stage left `new`/`contacted`/`qualified`, the customer said anything (an inbound
`message` activity or a logged reply), or — importantly — **the lead never received the
minute-0 welcome**. That last rule means switching the engine on cannot mail the back
catalogue: only leads that entered after activation are ever swept.

`vercel.json` schedules `/api/crm/cron` at `0 7 * * *` (auth: `Bearer CRON_SECRET` or a
signed-in operator). A second cron, `/api/crm/backup` at `0 3 * * *` (auth: `Bearer
CRON_SECRET` or a signed-in admin), mails a full JSON snapshot (leads, villas, events) to
`CRM_NOTIFY_TO` as a daily off-site backup.

## CrmEvent (interaction events)

Anonymous click log from the live site, kept separate from leads so it never pollutes the
pipeline. Written by the public `/api/event` endpoint (rate-limited 30/min/IP).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `type` | string | `click` \| `whatsapp` \| `phone` \| `email` \| `brochure` \| `form_open`; page views arrive as `visit` |
| `label` | string | Button/link text (visits: referrer host), max 120 |
| `path` | string? | Page path, max 200 |
| `source` | string? | Campaign source, max 80 |
| `at` | string | ISO |

Retention: only the high-volume `visit` type is bounded (newest 5000 kept); actionable signal
types are never dropped.

## VillaRecord (masterplan availability & sales)

Keyed by unit id (`"A1"` … `"H7"`). A unit with no record is `free`. A record whose status
returns to `free` **and** carries no sale data is deleted entirely (the history keeps the audit
trail); `hasSaleData()` decides what counts as sale data (buyer link/name, contract value,
promised date, construction beyond `not_started`, any paid phase, any extra).

| Field | Type | Meaning |
|---|---|---|
| `status` | `'free'` \| `'reserved'` \| `'sold'` | Availability shown on the masterplan and to partners |
| `seller` | string? | Who sold / reserved it (free text, max 120) |
| `note` | string? | Max 500 |
| `updatedAt` | string | ISO |
| `buyerLeadId` | string? | Linked CRM lead |
| `buyerName` | string? | Denormalized for display (from the lead's name/email at link time, editable) |
| `contractValue` | number? | THB; basis of the phase amounts |
| `promisedDate` | string? | ISO date — promised completion |
| `construction` | Construction? | `not_started` \| `foundation` \| `structure` \| `furnishing` \| `done` |
| `phases` | Partial\<Record\<PhaseKey, VillaPhase\>\>? | Payment milestones (below) |
| `extras` | VillaExtra[]? | `{ id, label (≤120), price? }` — presets in `EXTRA_PRESETS` (Podcast studio, Office setup, Gym corner, Sauna, Outdoor kitchen, EV charger) plus free text |

### Payment phases (7 / 43 / 40 / 10)

`PHASES` in `types.ts` — the resort's payment schedule as percentages of `contractValue`:

| Key | % | Label | Gate |
|---|---|---|---|
| `slot` | 7 | Slot deposit · 7% | Plot transferred to buyer |
| `foundation` | 43 | Foundation · 43% | Foundation complete |
| `build` | 40 | Building · 40% | Building complete |
| `furnish` | 10 | Furnishing · 10% | Furnishing complete |

`VillaPhase` = `{ paid: boolean, at?: ISO, amount?: number }` — `amount` is a THB override;
otherwise `phaseAmount()` computes `pct × contractValue`. `paidTotal()` sums the paid phases,
`nextPhase()` returns the first unpaid milestone.

## VillaHistoryEntry

Append-only audit log of every villa change (status moves, buyer link/unlink, contract-value
defaulting, phase paid/unmarked, construction changes, extras added/removed).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `villaId` | string | Unit id |
| `from`, `to` | VillaStatus | Status before/after (equal for non-status events) |
| `seller` | string? | |
| `note` | string? | Human line describing the event |
| `at` | string | ISO |

The UI reads the newest 400 (`getVillaHistory(400)`); the file backend caps storage at 3000
entries.

## Blocklist

A flat set of contact keys; inbound WhatsApp/ingest from a blocked contact never creates a
lead again (used by "Delete & block" on private/non-lead contacts). Key format:

| Prefix | Value |
|---|---|
| `e:` | E-mail, trimmed and lowercased — e.g. `e:jane@example.com` |
| `p:` | Phone key: digits only, **last 9 digits**, only produced when the number has ≥ 8 digits — e.g. `p:661234567` |

## Unit catalogue — `lib/villas.json`

Static masterplan geometry + unit metadata, rendered over `/images/masterplan.png`
(1191 × 712). Top-level: `image`, `w`, `h`, `villas[]`. **69 units** across blocks
**A–H** (A: 11, B: 11, C: 10, D: 9, E: 8, F: 7, G: 6, H: 7).

Per unit: `id` (block letter + number, e.g. `"B1"`), `block`, `n`, `x`/`y` (percent position on
the plan), and on 58 of the 69 units: `type` (`1BR` \| `2BR`), `size` (`M` \| `L` \| `XL`),
`area` (m² interior), `plotArea` (m²). The 11 block-A units carry position only — no
size/type. Size distribution: M 18, L 18, XL 22, unsized 11.

List prices come from `lib/crm/villas.ts` (mirrors the Residences section of the marketing
site; keep in sync when pricing changes):

| Villa | Size | List price (THB) |
|---|---|---|
| Residence M | 76.46 m² | 7,650,000 |
| Residence L | 79.19 m² | 8,050,000 |
| Residence XL | 126.65 m² | 11,200,000 |

`unitListPrice(id)` maps a unit's `size` to `Residence <size>` and returns its price — the
default contract value; unsized (block A) units have no default. The catalogue also feeds the
partner API `/api/3destate/units` (auth: `ESTATE_API_KEY`), which merges it with live
`VillaRecord` state: status (`free` is reported as `available`), `price` =
`contractValue ?? list price`, bedrooms from `type`, and an anonymized `payment_progress`
percentage — never buyer identity.

---

## Invariants

### One person = one lead

All automated intake goes through `upsertLeadFromPayload()`:

- **Matching** (`findLeadByContact`): e-mail compared trimmed + lowercased; phones compared by
  `phoneKey` — digits only, last 9 digits, only when the number has ≥ 8 digits (so short
  fragments can never match). The incoming payload contributes one key (`phone`, falling back
  to `whatsapp`), compared against both `phone` and `whatsapp` of every stored lead. When
  several leads match, the **most recently updated** one is the conversation to continue.
- **New person** → new lead. **Known person** → the message is appended as a note and context
  is merged: blank contact/villa fields are filled (curated values are never overwritten),
  `value` defaults from the villa list price if still empty.
- An inbound message **counts as a reply**: `awaiting_reply_since` is cleared and the open
  chase task is completed.
- An inbound message **revives a lost lead**: stage returns to `new`, `lost_reason` is cleared,
  logged as `"Lost → New (re-engaged)"`.
- The related-leads side panel (`relatedLeads`) uses a looser display-only match (suffix match
  with ≥ 6 digits on both sides) and never merges automatically; `/api/crm/dedupe` groups
  duplicates transitively (union-find over `e:`/`p:` keys) and folds each group into its
  **oldest** lead.

### Stage lifecycle

`new → contacted → qualified → reserved → won`, with `lost` as the exit at any point.
`stageEnteredAt()` = timestamp of the last `stage` activity, else `created_at`.

| Stage | `STAGE_MAX_DAYS` | Meaning of the threshold |
|---|---|---|
| `new` | 1 | First response within a day |
| `contacted` | 3 | Matches the reply-wait rhythm |
| `qualified` | 7 | A serious buyer gets weekly movement at minimum |
| `reserved`, `won`, `lost` | — | No stall threshold |

`isStalled()` — the lead sat in its stage longer than the threshold. A `new` lead older than
1 day with no notes and no tasks counts as **untouched** in the attention counts.

### No active lead without a next step

`ACTIVE_STAGES = ['new', 'contacted', 'qualified']`. `hasNoNextStep()` flags an active lead
that has **no open task and no running reply timer** — nobody owns its next move. Surfaced as
a red badge in the nav (`attentionCounts()`), together with overdue tasks, untouched new leads,
awaiting-reply leads past 3 days, and stalled leads.

### Score upgrades only on a hotter signal

Initial score from the form context (`scoring.ts`): `form_origin` starting with `villa` → hot;
`reserve` → hot; `enquiry` → hot when opened from investment/reserve areas, else warm;
`brochure_request` → cold; default warm. Rank order `hot < warm < cold`
(`SCORE_RANK = { hot: 0, warm: 1, cold: 2 }`): on a repeat contact, a hotter signal upgrades
the score (logged), a cooler one **never downgrades** it. Operators can still set any score
manually.

### Lost requires a structured reason

`LOST_REASONS`: `price` (Price), `timing` (Timing — not now), `competitor` (Bought elsewhere),
`unreachable` (Went silent / unreachable), `other` (Other). The UI (lead workspace and
pipeline board, via the lost-reason dialog) sets `stage: 'lost'` together with `lost_reason`
and adds a `"Lost: <label> — <detail>"` note; the PATCH endpoint accepts only ids from
`LOST_REASONS`. Moving to any non-lost stage clears `lost_reason`.

### Contract value defaults from the list price

`defaultContractValue()` fills `VillaRecord.contractValue` from `unitListPrice(id)` whenever a
deal starts and no value is set: on a status change to reserved/sold, and on the first paid
phase (so the 7/43/40/10 amounts compute immediately). Linking a buyer defaults it from
`lead.value || villaByName(lead.villa)?.price || unitListPrice(id)`. Defaulting from the list price is logged to the villa history
(`"Contract value set from list price (…)"`); the buyer-link default is only covered by its
`"Buyer linked: <name>"` entry. The value stays editable on the masterplan.

### Status auto-advances on payments

In `updateVillaSale` (`op: 'phase'`): marking any phase paid on a `free` unit moves it to
`reserved`; when **all four** phases are paid the unit becomes `sold`. The transition is logged
(`"Status advanced by payment"`) and mirrored to the Google Sheet (`sheetSync`, best-effort via
`SHEET_WEBHOOK` + `SHEET_SECRET`; inbound sheet edits arrive through `/api/villa-sync` and are
applied `silent` so they never loop back). Every status change is also pushed to the partner
webhook (`partnerPush`, active only when `PARTNER_WEBHOOK_URL` is set — anonymized like the
partner API, never buyer identity). Setting a unit back to `free` clears all sale data
(buyer, contract value, promised date, construction, phases, extras) — the audit trail keeps
the history.

### Merge semantics (idempotent, consent preserved)

`mergeLeads(primaryId, otherId)`:

- Fills **blank** fields only on the primary (`name`, `email`, `phone`, `whatsapp`, `villa`,
  `source`, all `utm_*`, `page_url`, `form_origin`, `value`) — nothing on the primary is ever
  overwritten.
- `gdpr_consent` is evidence: `true` on either side stays `true`.
- Notes, tasks and history are appended **deduplicated by id**, and the `merged` activity is
  logged only once per (form type, date) — so a retried merge (e.g. after a failed delete) is
  idempotent instead of double-appending.
- The duplicate is deleted afterwards.

---

## Reserved extension points (multi-user)

The auth layer already supports multiple named accounts (`auth.ts`): `CRM_USER`+`CRM_PASSWORD`
for the primary account (always admin) plus `CRM_USERS="name:password,name:password"`, with the
session cookie encoding **who** is signed in
(`<base64url(name)>.<sha256(name:password:salt)>`) — used for the greeting now, reserved for
the audit trail later. Accounts carry a **role**: a `CRM_USERS` entry may end in `:viewer`
(`name:password:viewer`), and every mutating endpoint rejects viewers with 403 (`isAdmin()`);
everyone else is an admin. What is deliberately not modeled yet:

- `Lead` has no `owner` field and `Activity`/`Note`/`Task` have no `actor` field — every
  admin sees and edits everything; `currentUser()` is the hook for attributing actions.
- `VillaRecord.seller` / `VillaHistoryEntry.seller` are free-text names, not account
  references.
- The outgoing e-mail signature is a single env-configured person (`CRM_AGENT_NAME`,
  `CRM_AGENT_TITLE`, `CRM_AGENT_PHONE`), noted in `automation.ts` as "later become
  per-salesperson".

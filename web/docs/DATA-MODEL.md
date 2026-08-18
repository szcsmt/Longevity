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
by the public form intake (`/api/lead`), the WhatsApp webhook (`/api/whatsapp`,
WhatsApp via the Meta Cloud API), or manually from the admin UI (`/api/crm/leads`).

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

## Archived leads

`archived_at`, `archived_by`, `archive_reason` on the Lead. Set instead of
deleting the row.

An archived lead is excluded from **every** list, count, report, worklist and
from the automated sequence, and its timeline, source attribution and ownership
history are all still there. That is the point: a wrong number and a customer's
entire history used to be one click apart, with last night's backup as the only
recovery.

Where the exclusion lives: `liveLeads()` in `store.ts`, which every aggregate
calls. `backend.allLeads()` still returns everything on purpose — the backup
depends on it, and a backup that omits the records somebody set aside is not a
backup. `listLeads({ archived })` takes `exclude` (the default), `include` (the
backup) or `only` (the archive view).

Two deliberate exceptions, both in `store.ts` and both commented there:

| Function | Behaviour | Why |
|---|---|---|
| `findLeadByContact` | **includes** archived | Somebody who writes to us again is a live enquiry. `upsertLeadFromPayload` un-archives their record rather than creating a second one beside it. "Never again" is the blocklist's job. |
| `relatedLeads` | excludes archived | The panel offers a one-click merge; a husk folded in by an earlier merge would offer itself for ever. |

**Merging** archives the duplicate with `archive_reason` = `Merged into <name>`
rather than deleting it. Everything was copied to the primary, but the fact that
a second record existed, and where it went, is part of the history.

**Permanent deletion** is `purgeLead`, and it refuses a lead that is not already
archived — two deliberate steps, never one click. Route:
`DELETE /api/crm/leads/[id]?purge=1`, admin only. There is no bulk purge.

## Prices, and the units that have none

`VILLAS` in `lib/crm/villas.ts` is the only place a price is written down. Each
entry carries its tier code (`M` / `L` / `XL`), which is what joins it to the
unit catalogue, and `priceForSize(tier)` is the single lookup. `unitListPrice(id)`
in the store resolves a unit through it.

A second copy used to live in `analytics.ts`, keyed by tier. Nothing would have
failed if the two drifted apart — every financial chart would simply have shown
the old figure.

**The A block has no tier.** A1 to A11 carry no `size`, `type` or `area` in
`lib/villas.json`, so they have no list price, and inventing one would be a
guess about money. Consequences, all deliberate:

- `unitListPrice` returns `undefined` for them.
- They contribute nothing to `totalInventoryValue`, which is why the analytics
  tile says how many units it excludes rather than presenting the total as the
  whole development.
- A sale there still counts, at whatever `contractValue` was agreed.
- One that is reserved or sold with neither is reported as `unit-without-price`.

Supplying the A block's types in `lib/villas.json` is all it would take; nothing
in the code needs to change for them to start being priced.

### One pass over the inventory

`analytics.ts` used to run two loops: the money over the 58 units with a tier,
the status over all 69. Selling an A-block villa moved `villaStatus.sold` and
left `financial.soldCount` behind — two figures on one screen disagreeing, with
nothing to announce it. There is one loop now, so they cannot come apart, and
each unit is valued at `contractValue ?? listPrice`, the same rule the masterplan
ledger uses.

## Referential integrity: a unit and its buyer

`VillaRecord.buyerLeadId` is a reference with nothing enforcing it — the store
is JSONB documents, so there is no foreign key to lean on. The two records can
drift apart in silence, and the first sign is a figure on the Payments page that
is quietly wrong, or a masterplan drawer with an empty buyer box that reads as
though somebody had unlinked them.

Three guards, in `store.ts`:

| Rule | Where | Behaviour |
|---|---|---|
| A lead holding a reserved or sold unit cannot be archived | `archiveLead` | Throws `CrmConflict` naming the unit; the route answers `409` |
| …nor permanently deleted | `purgeLead` | Returns `'holds-unit'`. Unreachable through the normal path, kept because a dangling reference is unrecoverable |
| Merging carries the unit across | `mergeLeads` | Re-points `buyerLeadId` at the surviving record and logs it on the unit's own history, then archives the husk |

`unitHeldBy(leadId)` is the shared check. **Free units are ignored**: sale data
lingers on a released unit by design, and a lead that once looked at something
is not holding it.

The merge case is the subtle one. The husk is the record that holds the unit
about half the time, and archiving a holder is refused — so without the
re-point, merging any buyer who had reserved something would simply fail. It
goes through its own `villaTxn` rather than `updateVillaSale` because the two
records are the same person, so the "already linked to somebody else" refusal
does not apply.

### integrityIssues()

Read-only, reported on the Payments page. Nothing here throws or shows up as an
error; each one is a number that is wrong until a person decides which record is
right, which is why it reports rather than repairs.

| Kind | Meaning |
|---|---|
| `dangling-buyer` | The unit points at a lead that no longer exists |
| `archived-buyer` | The buyer is out of every view while the unit still holds them |
| `held-without-buyer` | Reserved or sold with nobody named |
| `lead-without-owner` | An active, non-archived lead nobody is responsible for |

## Note

| Field | Type | Meaning |
|---|---|---|
| `id` | string | UUID |
| `body` | string | Cleaned, max 4000 chars |
| `at` | string | ISO |
| `by` | string? | Who wrote it. Unset on notes the CRM filed itself (an inbound reply, an AI brief) and on everything written before there was more than one user. |

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
| `by` | string? | Who added it |

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
| `download` | A tracked document link was opened (`"Opened: <title>"`), deduped within the hour |
| `click` | A button in a letter was pressed (`"Clicked: <label>"`), deduped within the hour |
| `document` | A document was produced for this lead — an offer (`"Offer LR-4F2A-0812"`) |

Fields: `id`, `kind`, `detail` (human line), `at`, and `by` — the signed-in person who did
it. `by` is deliberately absent on anything the system or the customer did, which is how the
timeline distinguishes "Anna moved this to Qualified" from "the CRM did".

## Qualification

`Lead.qualification`, written by `setQualification(id, patch, actor)`. All of it
used to live in free-text notes, so it could not be filtered, counted, or
depended on — and "Qualified" was a stage anybody could click without knowing a
single thing about the buyer.

Eight fields. The specification lists many more; eight is what survived the
question *does an answer here change what we do next*. The first four decide
whether this is a buyer, the last four decide how to sell to them. Everything
else belongs in a note, where a sentence says more than a dropdown.

| Field | Options |
|---|---|
| `budget` + `currency` | a number, in THB / EUR / USD / GBP — kept in the buyer's own money, because converting it loses what they actually said |
| `timeframe` | 0-3, 3-6, 6-12, 12+ months, unknown |
| `purpose` | investment, lifestyle, both |
| `financing` | cash, needs financing, unknown |
| `decision` | decides alone, shares the decision, unknown |
| `visit` | has been to Samui, planning a visit, not been, unknown |
| `motivation` | rental return, capital growth, personal use, retirement, diversification, other |
| `objection` | price, ownership, legal, doubts the return, location, trust, timing, financing, other |

`objection` is distinct from a lost reason: it is what stands in the way while
the deal is still alive, and it is what the next conversation has to answer.

**Every value is checked against its list**, and an unrecognised one is dropped
rather than stored. This is not defensiveness for its own sake — a stage rule is
about to read these fields, and a typo silently kept would make a lead look
qualified on answers nobody gave.

**Every change is logged individually.** "Budget set to EUR 250,000" three weeks
after "EUR 180,000" is a fact about the deal; a wholesale overwrite would hide
it. Setting a field to what it already holds writes nothing.

### missingQualification(lead)

Pure, in `rules.ts`. Returns the labels of the five answers still outstanding:
budget, timeframe, purpose, financing, and the residence of interest — which
lives on the lead itself rather than in this object.

`unknown` counts as unanswered on purpose. It is an honest thing to record and
it is still not knowing.

The lead page shows the same list the stage rules will enforce, so an operator
is never refused for a reason the screen did not show them first.

## Logged contact (TOUCHES)

A phone call used to be able to exist only as a free-text note — so the single
most important thing that happens to a lead was the one thing the CRM could not
see, count, or act on.

`logTouch(id, key, note, actor)` writes a typed history entry. Six options, in
`types.ts`: spoke by phone, no answer, video call, meeting, site visit,
WhatsApp. Deliberately short — the moment they are used is the moment somebody
wants to get on with the next call, and a list nobody can face is a list nobody
fills in.

`Activity.reached` carries the distinction everything turns on:

| | `reached: true` | `reached: false` |
|---|---|---|
| Examples | spoke by phone, video, meeting, site visit | no answer, outbound WhatsApp |
| First response recorded | yes | **yes** — they did pick up the phone |
| Reply timer cleared, chase ticked | yes | no |
| `new` → `contacted` | yes | no |
| Automated sequence | **stops** | keeps running |

Reaching somebody is the same event as them writing to us, seen from the other
end: a human now owns the conversation. A call that rang out is worth recording
— it is the difference between "nobody has tried" and "tried twice, no luck" —
but nothing downstream may treat it as contact.

It is a structured field rather than something parsed out of `detail`, because
`sequenceState` depends on it, and a rule that reads text is a rule that breaks
when somebody rewords a label.

### Opening a channel — `logOutreach(id, channel, actor)`

The lead page's **Email**, **WhatsApp** and **Call** buttons open a `mailto:`, a
`wa.me` link and the dialler. The CRM used to see nothing at all when they were
pressed, which made the two commonest sales channels in the building its blind
spot.

`logOutreach` records what actually happened — the channel was **opened**:

| `channel` | `Activity.kind` | `detail` |
|---|---|---|
| `email` | `email` | Opened the mail client to write to them |
| `whatsapp` | `whatsapp` | Opened WhatsApp to write to them |
| `phone` | `call` | Dialled their number |

Not "sent an e-mail". A mail client opening is not a message leaving, and
writing down something we do not know would be worse than the silence it
replaces. So `reached` stays **unset**: nothing downstream treats it as contact,
the automated sequence keeps running, and a `new` lead stays `new`. It does set
`first_response_at` — somebody went to write or call, which is exactly what
speed-to-lead measures.

Repeats of the same channel inside `OUTREACH_WINDOW_MIN` (10 minutes) are
dropped. A double-click, a bounce back to the tab and a second attempt are one
intention, and a timeline that logs three is a timeline people stop reading.

The client fires it alongside the navigation — never awaited, failures silent.
The click's real job is opening the other app, and an alert the operator has
already navigated away from is worse than a missing line.

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

| Step | Day | Document | What it is |
|---|---|---|---|
| `welcome` | 0 | `overview` | Thank-you, personalised to the form type (brochure / reservation / general). Sent by the **intake**, not the cron; never for a returning contact |
| `reminder` | 3 | — | One gentle nudge |
| `story` | 10 | `brochure` | What Longevity is — a reason to care again |
| `viewing` | 24 | `overview` | Invitation to visit, in person or by video |
| `terms` | 45 | `brochure` | Pricing and the 7/43/40/10 payment schedule |
| `closing` | 60 | — | A graceful last word — then the engine stops |

The document escalation is deliberate. The 12-page overview (2.6 MB) opens instantly on a
phone and is what a stranger will actually read, so it goes first; the 52-page brochure
(14 MB) is held back for day 10, by which point someone still reading has earned it. Steps
with no document are the ones whose job is to ask rather than to give. An explicit
`brochure_request` is the exception: they asked for the brochure, so they get the brochure.

Each letter is signed by the lead's `owner` (name, title, phone, WhatsApp link) and carries
an opt-out link. The daily sweep advances a lead by **at most one step per run** — several
steps coming due at once (after a cron outage) sends only the latest, never a burst.

**Channel.** E-mail is preferred whenever there is an address: it carries the designed
letter and can be read later. A lead with a number and no address gets the WhatsApp version
of the same step (`whatsappMessage()` in `letters.ts`) — short, one idea, one tracked link,
and a real question, because a chat that reads like a mailshot gets blocked. Before this,
such leads received nothing at all. A send Meta refuses (the 24-hour window, usually) records
nothing, so the step simply comes due again the next day.

A lead drops out of the sequence when any of these is true: there is no e-mail address **and
no WhatsApp number**, `unsubscribed`
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
| `ref` | string? | **WhatsApp taps only.** The code carried into the prefilled message, max 16, upper-cased |
| `locale` | string? | **WhatsApp taps only.** Site language at the tap, max 10 |
| `page_url` | string? | **WhatsApp taps only.** Full URL at the tap, max 300 |
| `utm` | object? | **WhatsApp taps only.** `source`/`medium`/`campaign`/`term`/`content`, max 120 each |

The last four are the handover pack for the one click that leaves for a channel which tells
us nothing about its origin. Meta's webhook delivers a phone number and a line of text, so
without them a website enquiry and a cold stranger are indistinguishable. `findEventByRef`
matches the code back for **24 hours** (`REF_WINDOW_MS`), after which the event is inert
history like any other click. See `docs/API.md` → *Website tap → WhatsApp lead*.

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

`VillaPhase` = `{ paid: boolean, at?: ISO, amount?: number, due?: ISO }` — `amount` is a THB
override, otherwise `phaseAmount()` computes `pct × contractValue`. `paidTotal()` sums the
paid phases, `nextPhase()` returns the first unpaid milestone.

`due` is optional because most of the schedule is governed by progress on site rather than by
the calendar: the 43% falls due when the foundation is finished, whenever that is. So
`finance.ts` treats an instalment as **due** once its construction gate has been passed
(`not_started` releases `slot`, `foundation` releases `foundation`, `structure` releases
`build`, `furnishing` releases `furnish`) and still unpaid — no date required. Set `due` when
a specific date has actually been agreed with a buyer; only then can an instalment be
**overdue**, with a real day count. This is what the Payments view is computed from; nothing
about it is stored twice.

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

A flat set of contact keys; an inbound WhatsApp message from a blocked contact never creates a
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

`new → contacted → qualified → presentation → visit → negotiation → reserved → contract → won`,
with `lost` as the exit at any point. `stageEnteredAt()` = timestamp of the last `stage`
activity, else `created_at`.

There were six. A presentation, a viewing and a negotiation — three of the things that really
happen to a deal — were not among them, so everything between Qualified and Reserved looked
like one step and the funnel could never say where deals actually die. Ten, and not one more:
the specification lists fourteen, but most of the rest are either a different concept wearing a
stage's clothes (nurture is a date; "unqualified" is a lost reason) or a distinction nobody here
would keep current. A stage costs a column on the board and a decision every time somebody moves
a card.

Each carries a `blurb` — what the stage **means** — shown wherever one is being chosen.
"Presentation" only stops being a guess once it says a presentation actually happened.

| Stage | `STAGE_MAX_DAYS` | Meaning of the threshold |
|---|---|---|
| `new` | 1 | First response within a day |
| `contacted` | 3 | Matches the reply-wait rhythm |
| `qualified` | 7 | A serious buyer gets weekly movement at minimum |
| `presentation` | 7 | A presentation with no follow-up inside a week has gone cold |
| `visit` | 10 | Somebody who has stood on the plot is deciding, not forgetting |
| `negotiation` | 14 | A fortnight of silence mid-negotiation is a deal in trouble |
| `reserved`, `contract` | — | Past a reservation the payment schedule is the clock; a second one competing with it would only produce flags nobody acts on |
| `won`, `lost` | — | Closed |

`isStalled()` — the lead sat in its stage longer than the threshold. A `new` lead nobody has
had a conversation with counts as **uncontacted** in the attention counts.

#### Reading the order, instead of listing stage names

Every "is this still open" and "has it got at least this far" test used to be its own literal
array in whichever file needed it, which is how six of them quietly disagreed.

- `stageIndex(id)` — position in `STAGES`.
- `OPEN_STAGES` / `isOpenStage(id)` — everything except `won` and `lost`.
- `atOrBeyond(id, target)` — at that stage or past it, and **never true for `lost`**, which left
  the order rather than travelling along it. `lost` sits last in the array, so a naive index
  comparison would report a lost deal as having reached every stage there is.

`ACTIVE_STAGES` is now `OPEN_STAGES`. It used to stop at Qualified, so a reservation with
nothing planned raised no flag at all — precisely where a deal is most expensive to lose.

### Stage entry rules

Two kinds, deliberately different.

**Refused — `reserved`, `contract`, `won` require a residence on the lead.** All three assert
that a specific villa is involved; without one the masterplan cannot show who is holding the
plot, the sales value has nothing behind it, and nobody notices until somebody tries to sell the
same villa twice. `updateLead` throws a `StageConflict` (a `CrmConflict`) naming the stage and
the reason, nothing is written, and the API answers `409` with the sentence. `bulkUpdate`
collects the refusals **by lead name** — "3 leads could not be moved" with no explanation is
indistinguishable from a broken button. The rule fires only when the stage is *changing to* one
of the three, so a lead that reached a late stage before this existed keeps editing normally.

**Recorded, not blocked — everything else.** Moving to `qualified` or beyond without the four
answers is allowed, and the gap is written onto the stage entry itself:

    New → Presentation — still unknown: budget, timeframe, purpose

on the same line as the claim, so the timeline shows the assertion and its evidence together.
The lead page asks for a confirmation first, naming the same gaps. A CRM that argues with a
salesperson about what a conversation established is a CRM they stop updating, and then it knows
nothing at all.

### No active lead without a next step

`ACTIVE_STAGES = ['new', 'contacted', 'qualified']`. `hasNoNextStep()` flags an active lead
that has **no open task and no running reply timer** — nobody owns its next move. Surfaced as
a red badge in the nav (`attentionCounts()`), together with overdue tasks, untouched new leads,
awaiting-reply leads past 3 days, and stalled leads.

## Performance — `lib/crm/performance.ts`

Pure: every figure is derived from a list of leads, nothing is fetched, and the whole module is
testable without a database. It backs `/admin/performance`, the head-of-sales screen.

It exists because most of it was already being computed and thrown away. `reports()` in the
store worked out source-by-source win rates and revenue on **every call** and was rendered by no
page at all — it has been deleted, and what was useful in it lives here. The old funnel counted
how many leads sat in each stage but never the drop between them, which is the only part
anybody acts on.

Deliberately **not** here: anything the analytics page already answers well — inventory,
traffic, campaign volume. Two screens computing the same number two different ways is how a
management meeting turns into an argument about the CRM.

| | |
|---|---|
| `funnel` | Per stage: `reached`, `ofTotal`, **`ofPrevious`** and `lostHere` |
| `cycleDays` | Median days from arriving to sold |
| `firstContactHours` | Median hours from arriving to a real **conversation** (`firstConversationAt`) — an automatic e-mail and a call that rang out are neither of them contact |
| `bySalesperson` | Leads, open, pipeline value, sold, sales value, conversion, and how many of their live leads are asking for attention. Unowned leads get their own `UNASSIGNED` row rather than being dropped |
| `bySource` | leads → qualified → reserved → sold → money. `winRate` is `null` when nothing is decided |
| `lostReasons` | From the structured `lost_reason` |
| `attention` | The four working-queue rules, counted |

**Reaching, not sitting in.** A lead now at Negotiation reached every stage before it, and a
lost deal reached the stages it passed through — `furthest(lead)` is `lost_from` for a lost
deal and its current stage otherwise. Without that, every drop-off would read as if the deals
had evaporated rather than been lost somewhere specific.

**`ofPrevious` is the number worth a meeting.** "41 reached Presentation" is a fact; "only a
quarter of the leads that got a presentation ever reached a viewing" is a decision.

**`lost_from`** is stored on the lead at the moment of loss rather than read back out of the
timeline text — a rule that parses a sentence breaks the day somebody rewords a label. It is
absent on anything lost before the field existed, so `lostHere` under-counts by exactly
`lost − lostStageKnown`, and the screen **says so** rather than quietly rounding.

**`winRate: null`, not 0%.** A source with nothing decided yet has no win rate, and printing
zero would libel a campaign that is simply young.

## Agencies, and the registrations that decide who gets paid

Careful with the word **agent**. In this codebase it already means one of *our* salespeople —
the `CRM_AGENTS` roster, the `owner` on a lead, the `agent` login role. The records below are
the firms that bring us buyers. So an **`Agency`** is that firm, a **`Broker`** is a named
person at it, and our own people stay where they were. The UI says "agency" and "agent"
because that is what the operator calls them; the code says `Agency` and `Broker` because
`Agent` was taken and quietly reusing it would be a bug waiting to happen.

Before this, an introducing agency was a free-text word in `source`: no date, no way to settle
who brought a buyer first, no answer to "which agencies produce sales". None of it could be
reconstructed afterwards, which is why it came before the prettier work.

### `Agency` — `lib/crm/partners.ts`

| Field | |
|---|---|
| `name`, `country`, `website`, `note` | |
| `status` | `AGENCY_STATUS`: `prospect` (in discussion), `active`, `paused`, `ended`. A new agency starts as a conversation, not a partner |
| `agreement_at` | ISO date the agreement was signed |
| `commission_model` | `COMMISSION_MODELS`: `percent`, `fixed`, `tiered`, `none` |
| `commission_pct` / `commission_fixed` | the number the model needs. Over 100% is dropped as the typo it is |
| `protection_days` | this agency's own window; absent means the house default |
| `contacts` | `Broker[]`, nested. Deactivated (`inactive`), **never removed** — a claim can point at somebody who left last year and must keep reading with their name on it |
| `archived_at` / `archived_by` | there is no delete |

Stored as whole documents (`allAgencies` / `saveAgency` on the backend, `crm_agencies` in
Postgres), like project notes: the record is small and edited rarely, by one admin at a time,
so a revision dance would buy nothing.

**The protection window** is `CRM_AGENCY_PROTECTION_DAYS` (default 90) unless the agency
carries its own — configuration, not a constant, because 90 days is a market convention and
not a law.

### `AgencyClaim` — on the lead

The thing that gets argued over by e-mail: *"we introduced that buyer to you in March."*
`lead.claims` is **append-only**. A claim is never edited and never deleted; a second agency
registering the same person adds an entry rather than replacing one, which is exactly what
makes it evidence.

| Field | |
|---|---|
| `agencyId` + `agencyName` | the name is denormalised at registration — an agency can be renamed, the claim has to keep reading as it did on the day |
| `brokerId` + `brokerName` | who at the agency, if named |
| `at`, `expires_at` | registered when, protected until |
| `by`, `note` | who recorded it here, and why |
| `released_at` + `release_reason` | withdrawn, and kept. A withdrawn claim is evidence too |
| `overrode` | the claim id this one was deliberately recorded over |

**Two questions, deliberately not the same function** (`rules.ts`, pure):

- `activeClaim(lead, today)` — *may somebody else register this person right now?* The most
  recent claim neither released nor expired. It **expires**, because a claim that never expires
  is a claim on a person forever.
- `creditedClaim(lead)` — *who brought us this buyer?* The **first** claim that was never
  released. It does **not** expire: a deal closing thirteen months after the introduction was
  still that agency's introduction. Every production figure is counted against this one.
- `competingClaims(lead)` — every agency currently asserting a claim, so "two agencies are
  claiming this buyer" is something the screen can say rather than something to discover later.

`registerAgency()` **refuses** a different agency while a claim is live, throwing a
`ClaimConflict` (a `CrmConflict`) that names who holds it and until when — nothing is written,
so a refused registration leaves no trace. `override: true` records over it anyway; that is an
admin decision, the new claim stores the id it superseded, and the timeline says so.
`releaseClaim()` needs a reason.

**A merge carries claims across** and re-sorts them by date. Folding two records for the same
person together must never be what loses an agency their introduction.

### `performanceFor(agency, leads)`

Registered, live, qualified (reaching it or beyond), site visits, reserved, won, lost, won
value, pipeline value, conversion %. Counted against `creditedClaim`, so an expired window
never quietly moves a sale to whoever registered the same person later. Archived leads are
excluded, as everywhere.

`commission` is what the agreement generates on the won volume, and is **absent** rather than
zero when nothing is agreed — a zero reads as "they earn nothing", which is a different
statement. What has actually been *paid* is not tracked yet and is deliberately not guessed at.

### Nurture — parked until a date

Not every lead that will not buy this month is lost. The six-to-eighteen-month wait is normal
here: they are waiting on a Thailand trip, a house sale, a partner, the next phase coming out of
the ground. Before this there were two places to put such a lead and both destroyed something —
Closed Lost meant nobody looked again and the lost-reason report filled with deals that were
never lost; left in Qualified they were flagged stalled every day, which is how a team learns to
ignore its own flags.

| Field | |
|---|---|
| `nurture_until` | ISO **date** (`YYYY-MM-DD`), always in the future when set |
| `nurture_reason` | one of `NURTURE_REASONS`: `visit`, `funds`, `later`, `partner`, `build`, `other` |

`setNurture(id, until, reason, note, actor)` — refuses a date that is not in the future and drops
a reason that is not on the list. Writes a `nurture` activity, and **clears the reply timer**: a
lead must not wake up flagged for a silence we chose. `endNurture(id, actor)` brings it back
early. `updateLead` clears it automatically on any **stage change** — real movement beats a
parking date set weeks ago, and silently keeping it would hide a live deal for a month.

While `isNurtured(lead, today)` is true the lead:

- is out of the working queue and every `?flag=` count (`inPlay` excludes it),
- is out of the automated sequence (`sequenceState` → *Parked until …*),
- shows **Parked until …** in the leads table and on its pipeline card instead of a stall flag.

Its **stage does not change** — a qualified buyer waiting on a house sale is still a qualified
buyer. On the day the date arrives the lead returns in its own queue section, `wake`, with the
reason still attached.

### The next step, and the working queue

A lead's **next step** is its earliest-DATED open task — `nextAction()` in `rules.ts`. Not a
separate field: a second place to write the same sentence is a second place for it to go stale,
and the task list is already where a salesperson types it. Undated tasks sort last; a
note-to-self must never push a dated commitment down the list.

`nextActionState(lead, today)` → `overdue | today | upcoming | undated | none`. Comparison is on
**calendar dates**, not instants: a due date is stored as midnight UTC, so an instant comparison
would call today's follow-up late from the moment the UTC day turns over.

`hasConversed(lead)` — has anybody actually talked to them. True when a logged touch has
`reached: true`, or the customer wrote back (`message`, or an `email` activity starting
`Reply received`). An automated e-mail leaving the building is not contact, and neither is a
call that rang out.

`workQueue(leads, today)` builds the **Today** screen (`/admin/today`) and the nav badge. It
returns six sections in working order, and **every lead appears in exactly one** — the most
urgent reason that applies:

| # | Section | A lead lands here when |
|---|---|---|
| 1 | `uncontacted` | stage `new` and `hasConversed()` is false |
| 2 | `overdue` | next step dated before today |
| 3 | `today` | next step dated today |
| 4 | `wake` | `nurture_until` set and the date has arrived |
| 5 | `silent` | `awaiting_reply_since` older than `REPLY_FLAG_DAYS` (3) |
| 6 | `nonext` | `hasNoNextStep()` — live deal, nothing planned |
| 7 | `stalled` | `isStalled()` — past the stage threshold |

Archived leads, the `won` / `lost` stages and leads still parked are excluded (`inPlay`). Inside a section the oldest lead
sorts first: the one that has been waiting longest is the one most likely to be lost.

The six rules live in `QUEUE_RULES` and are read **two ways**, from the one definition:

- `workQueue()` assigns each lead to the **first** rule it matches — the Today screen.
- `matchesFlag(lead, key)` asks one rule on its own — the lead list's `?flag=` filter, where
  "show me every stalled lead" must include the ones the queue already gave to a louder rule.

`LeadFilter.flag` applies it in `listLeads()`. The query value is validated with
`isQueueKey()`, which uses `Object.hasOwn` rather than `in`: `'constructor' in QUEUE_RULES` is
true, and a query string reaching a filter is exactly where that matters.

Every count in `attentionCounts()` comes from these same predicates — `untouched` is
`uncontacted`, `awaiting` is `silent`, and so on — so a dashboard capsule reading "7 without a
next step" opens a list of exactly those seven. The one exception is `overdueTasks`, which
counts TASKS rather than leads because it badges the Follow-ups page, which lists tasks.
`actionable` is the queue's own total.

`REPLY_FLAG_DAYS` lives in `rules.ts` (pure, client-importable) rather than the store, because
the masterplan needs it too.

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

## Multi-user

Accounts come from env, merged: `CRM_USER`+`CRM_PASSWORD` (the primary account, always admin)
plus `CRM_USERS`, comma-separated `name:password[:role]`. The session cookie encodes **who**
is signed in (`<base64url(name)>.<sha256(name:password:salt)>`), so the app always knows the
actor. Three roles — `admin`, `agent`, `viewer` — with the split documented in API.md. An
entry with no role stays admin, so nothing that worked before this existed stopped working.

Attribution: `Note.by`, `Task.by` and `Activity.by` carry the signed-in name, threaded from
the route handlers as an explicit `actor` argument rather than picked up from ambient
request state — the same store functions are called by the cron and by inbound webhooks,
where there is no signed-in person and `by` must stay unset.

`Lead.owner` names a person on the `CRM_AGENTS` roster and is assigned at intake, balancing
load among the agents who speak the lead's likely language (`language.ts` reads that from the
dialling code, then the browsing locale, then the e-mail TLD). The leads list defaults an
agent to their own leads, one click from everyone's.

Still not modeled:

- `VillaRecord.seller` / `VillaHistoryEntry.seller` are free-text names, not account
  references.
- Roles are global, not per-lead: an agent can open any lead, not only their own. That is
  deliberate while the team is small enough to cover for each other.

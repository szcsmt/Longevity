# CRM — gap analysis and running plan

**Purpose:** this file is the memory of the rebuild. The audit
([LEAD-MANAGEMENT-AUDIT.md](./LEAD-MANAGEMENT-AUDIT.md)) says what the system *is*; this says
what we decided to do about it, in what order, and what has actually shipped. A conversation
can be closed at any point and the next one starts here.

Ticked items are in `git log` with a `P0.x` / `P1.x` prefix and their own tests.

---

## Where the system stands

A Next.js 16 app on Vercel + Neon. One `Lead` document holds everything about a person —
contact, attribution, notes, tasks, activity timeline, qualification, sent letters — so a lead is
one read and its history is never partial. Persistence is pluggable (Postgres in production, a
JSON file in dev and in the tests), and the two backends implement the revision guard
identically, so a race proven in a test is a race prevented in production.

**The architecture supports what the specification asks for.** Nothing below needs a rewrite;
the work is filling gaps and closing blind spots.

---

## Gap analysis

### EXISTING — implemented, tested, keep

| | |
|---|---|
| Lead intake | Website forms, WhatsApp webhook, inbound e-mail, manual entry — all through one gate (`upsertLeadFromPayload`) that matches on contact and appends to the existing lead rather than making a duplicate |
| Ownership | Every lead gets an owner the second it lands; language-aware, load-balancing round robin |
| Audit trail | Typed `Activity` history on every lead: created, assigned, stage, score, contact edits, value, merges, letters, replies, documents, calls, archive |
| Archive, not delete | `archived_at` instead of a `DELETE`; a real erasure is a second, deliberate step and refuses a lead that still holds a unit |
| Duplicates | Transitive grouping by e-mail/phone, a controlled merge that never overwrites the primary and never loses notes, tasks, history, consent or attribution |
| Inventory | 69 plots with status, buyer link, contract value, construction state and a four-step payment schedule; optimistic locking makes a double reservation impossible |
| Referential integrity | `integrityIssues()` finds units pointing at leads that are gone, buyers that drifted, sold units still marked free |
| Qualification | Eight structured fields, all optional, validated against their option lists |
| Logged contact | Calls, video, meetings, site visits, WhatsApp — with `reached` separating "we tried" from "we spoke" |
| Automated sequence | Six letters, minute 0 → day 60, stopping the moment a human owns the conversation |
| Roles | admin / agent / viewer, with the irreversible and the exportable reserved to the owner |
| Speed to lead | `first_response_at` — the first moment a *person* acted |
| Reservations and contracts | A reservation record with deposit agreed / received / expiry / agreement, a release that needs a reason, `reservationWatch()` for the holds running out, and a four-step SPA status stamping each date once |
| Attribution | Channel / campaign / ad, each walking leads → qualified → reserved → sold → money. Sources are normalised on read (`fb`, `Facebook`, `FB_ads` are one row) without ever overwriting the raw value |
| Management reporting | `/admin/performance`: funnel with stage-to-stage drop, cycle length, time to first conversation, production by salesperson / source / agency, lost reasons from the structured field |
| Pipeline | Ten ordered stages with what each one means, positional helpers (`atOrBeyond`, `OPEN_STAGES`), a refusal on the stages that assert a unit, and the qualification gap written onto the stage entry |
| Introducing agencies | `Agency` + nested `Broker` records, append-only registrations on the lead, an auditable protection window that refuses a competing claim, and per-agency production figures counted against whoever introduced the buyer first |

### PARTIAL — works, but not all the way

| | What is missing |
|---|---|
| Scoring | One hot/warm/cold, from the form type plus AI triage. The specification asks for fit and engagement kept apart |
| Country / nationality | Language is inferred from the phone number; nationality is neither stored nor filterable |
| Filters | Stage, score, form, owner, free text and now the attention flags. Not budget, timeframe, country or value |
| Permissions | Three roles. Head of sales, marketing and finance all currently mean "admin" |
| Global search | Leads only — not units, not agencies |

### MISSING

| | Why it matters |
|---|---|
| **Configurable payment schedules** | 7 / 43 / 40 / 10 is hard-coded in `PHASES`. It is right for this project and wrong as a permanent assumption |
| Configurable SLAs | `STAGE_MAX_DAYS` and `REPLY_FLAG_DAYS` are constants in code |

### NEEDS REFACTORING

- `store.ts` still holds leads, units, events, notes and settings in one file, though the agency and reporting aggregates now live in `partners.ts` and `performance.ts`. Split the rest by aggregate when it next needs a real change, not before.
- `dictionaries.ts` is 110 KB in one file.
- Two client components call `Date.now()` during render (a real React purity warning, pre-existing).

---

## The plan

### P0 — data and business integrity ✅ *shipped*

- [x] **P0.1** A villa cannot be reserved twice — optimistic locking on units, mirrored in both backends
- [x] **P0.2** Archive instead of delete, so a history cannot be lost
- [x] **P0.3** A unit and its buyer cannot drift apart — referential integrity plus a report of what is already broken
- [x] **P0.4** One price table, and one pass over the inventory

### P1 — sales effectiveness ✅ *shipped*

- [x] **P1.1** A phone call can be something the CRM knows about (`logTouch`, `reached`)
- [x] **P1.2** Qualification in fields, not prose
- [x] **P1.3** The day, in the order it should be worked — `/admin/today`
- [x] **P1.4** The attention rules become a filter, not just a number — `?flag=`
- [x] **P1.5** Email and WhatsApp buttons stop being invisible (`logOutreach`)
- [x] **P1.6** "Not now" stops meaning "lost" — nurture
- [x] **P1.7** Agencies and the registrations that decide who gets paid — `Agency` + `Broker`,
      an append-only claim on the lead, an auditable protection window, and production figures
      per agency
- [x] **P1.8** The stages the sales actually has — presentation, visit, negotiation and contract,
      ordered helpers instead of six disagreeing literal arrays, a refusal where the rule is
      objective (a unit) and a recorded gap where it is judgement
- [x] **P1.9** The head-of-sales screen — `/admin/performance`: the funnel with the drop between
      its steps, cycle length, time to first contact, production by person / source / agency,
      and why we lose. `reports()` is gone; `lib/crm/performance.ts` is pure and tested

### P2 — management and optimisation

- [x] **P2.1** Source normalisation — `sources.ts`, applied on read so nothing is migrated and
      no raw value is ever overwritten; reports, the lead filter and the export all group by
      channel instead of by spelling
- [x] **P2.2** Attribution by campaign and by ad — the same leads → qualified → reserved → sold
      → money chain one and two levels down, rendered only when the links actually carry tags
- [x] **P2.3** Reservation as its own record — deposit agreed vs deposit received, an expiry
      that is watched, a release that needs a reason, and a refusal to hold a villa for nobody
- [x] **P2.4** Contract / SPA status with the date each step was reached
- [ ] Commission actually **paid**: a per-agency ledger with dates, so outstanding is a fact
      rather than a subtraction. `performanceFor` computes only what an agreement *generates*,
      and deliberately does not guess at the rest
- [ ] Configurable payment schedules per project or deal
- [ ] Country / nationality on the lead, inferred and correctable, filterable
- [ ] Fit and engagement as two scores
- [ ] Filters on budget, timeframe, value
- [ ] Configurable SLA thresholds

### P3 — later

- [ ] Roles for marketing, finance and legal, with permissions that match responsibilities
- [ ] External agent portal
- [ ] Global search across units and agencies
- [ ] `store.ts` split by aggregate

---

## Working rules for whoever picks this up

1. **Read this file and the audit before changing anything.** They are the reason the last five
   changes did not duplicate something that already existed.
2. **One idea per commit**, with its own tests, and the docs updated in the same commit.
   `npm test`, `npx tsc --noEmit` and `npx next build` all clean before it goes in.
3. **Never invent a fact.** If the system does not know whether an e-mail was sent, the timeline
   says the mail client was opened. A confident wrong record is worse than a gap.
4. **A number and the page it links to must agree.** Every count on the dashboard is computed by
   calling the same function the page filters with.
5. **Nothing gets hard-deleted.** Archive, and let a purge be a second deliberate step.
6. **Do not add a field because the specification lists it.** Add it when an answer in it changes
   what somebody does next.

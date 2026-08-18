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

### PARTIAL — works, but not all the way

| | What is missing |
|---|---|
| Pipeline stages | Six stages. Presentation, site visit and negotiation happen but are not stages, so the funnel cannot show where deals actually die |
| Stage entry rules | `missingQualification()` computes the gaps and nothing enforces them — "Qualified" is still a stage anybody can click |
| Lost reporting | `reports().lostReasons` reads the `"Lost: …"` **note text** while `lead.lost_reason` holds the structured value. Two sources, one of them fragile |
| Scoring | One hot/warm/cold, from the form type plus AI triage. The specification asks for fit and engagement kept apart |
| Attribution | Source, campaign and UTM are all stored, and `reports().bySource` computes source → won → revenue — **but no page renders it** |
| Source values | Whatever arrives in `?source=` / `utm_source`, unnormalised: `fb`, `Facebook`, `FB_ads` are three rows in a report that only shows eight |
| Country / nationality | Language is inferred from the phone number; nationality is neither stored nor filterable |
| Filters | Stage, score, form, owner, free text and now the attention flags. Not budget, timeframe, country or value |
| Permissions | Three roles. Head of sales, marketing and finance all currently mean "admin" |
| Global search | Leads only — not units, not agencies |

### MISSING

| | Why it matters |
|---|---|
| **External agencies and agents** | The single biggest hole. An introducing agent is a free-text word in `source`. No agency record, no registration timestamp, no protection window, no production figures, no commission tracking. Attribution not captured today cannot be reconstructed later |
| **Reservation as a process** | A unit flips to `reserved` and a `slot` phase gets ticked. No reservation date, amount, expiry, agreement document or deposit status of its own |
| **Contract / SPA tracking** | Sent → reviewed → signed, with dates. Today the whole contract stage is one status word on a plot |
| **Configurable payment schedules** | 7 / 43 / 40 / 10 is hard-coded in `PHASES`. It is right for this project and wrong as a permanent assumption |
| Head-of-sales dashboard | Conversion between stages, cycle length, pipeline and sales by person, agency and source — all computable, none assembled on one screen |
| Configurable SLAs | `STAGE_MAX_DAYS` and `REPLY_FLAG_DAYS` are constants in code |

### NEEDS REFACTORING

- `store.ts` is ~2000 lines and holds leads, units, events, notes and settings. Split by aggregate when it next needs a real change, not before.
- `dictionaries.ts` is 110 KB in one file.
- Lost reasons read from note text (above) — one source of truth, not two.
- `reports()` is dead code: computed on every call, rendered nowhere.
- Two client components call `Date.now()` during render (a real React purity warning, pre-existing).

---

## The plan

### P0 — data and business integrity ✅ *shipped*

- [x] **P0.1** A villa cannot be reserved twice — optimistic locking on units, mirrored in both backends
- [x] **P0.2** Archive instead of delete, so a history cannot be lost
- [x] **P0.3** A unit and its buyer cannot drift apart — referential integrity plus a report of what is already broken
- [x] **P0.4** One price table, and one pass over the inventory

### P1 — sales effectiveness

- [x] **P1.1** A phone call can be something the CRM knows about (`logTouch`, `reached`)
- [x] **P1.2** Qualification in fields, not prose
- [x] **P1.3** The day, in the order it should be worked — `/admin/today`
- [x] **P1.4** The attention rules become a filter, not just a number — `?flag=`
- [x] **P1.5** Email and WhatsApp buttons stop being invisible (`logOutreach`)
- [x] **P1.6** "Not now" stops meaning "lost" — nurture
- [ ] **P1.7 Agencies and introducing agents.** Two records (`Agency`, `Agent`), a registration
      stamped on the lead the moment it arrives, and a protection window that is *auditable*
      rather than argued over by e-mail. Production figures per agency: registered, qualified,
      reserved, sold, volume. **Nothing here can be back-filled — every week without it is
      attribution lost for good.**
- [ ] **P1.8 The stages the sales actually has.** Add presentation, site visit and negotiation;
      make the funnel positional rather than assumed. Entry rules where they are objective
      (Qualified needs the four answers; Reserved needs a unit), warnings where they are not.
- [ ] **P1.9 The head-of-sales screen.** Stage-to-stage conversion, cycle length, pipeline and
      won value by person / source / agency, lost reasons — assembled from `reports()`, which
      already computes most of it and is rendered nowhere.

### P2 — management and optimisation

- [ ] Source normalisation at intake, so a report counts campaigns rather than spellings
- [ ] Attribution chain: source → qualified → reservation → contract → revenue
- [ ] Reservation as its own record: date, amount, expiry, agreement, deposit status
- [ ] Contract / SPA status with dates
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

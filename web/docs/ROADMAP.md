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
| Partner portal | An agency registers buyers itself and follows its own introductions; the code is stored as a hash, re-issuing it kills every session, and a taken buyer is reported without naming who holds it |
| Search | One box over leads, agencies and their agents, and units — phone numbers matched on their last nine digits, archived records included and labelled |
| Permissions | Six roles mapped to nine capabilities in one table; routes ask for the capability, archiving is separated from purging, and marketing is the one role the money is hidden from |
| Scoring | Hot/warm/cold as the operator's judgement, plus derived fit and engagement scores kept apart, with a verdict for the pair |
| Segmentation | Country read off the dialling code and correctable, budget comparison across currencies at configured rates (and an honest refusal to compare without them) |
| Payment schedules | A step's percentage AND its construction gate are configuration: per project via env, per unit when negotiated, stamped at the moment money is agreed so old deals keep their terms |
| Reservations and contracts | A reservation record with deposit agreed / received / expiry / agreement, a release that needs a reason, `reservationWatch()` for the holds running out, and a four-step SPA status stamping each date once |
| Attribution | Channel / campaign / ad, each walking leads → qualified → reserved → sold → money. Sources are normalised on read (`fb`, `Facebook`, `FB_ads` are one row) without ever overwriting the raw value |
| Management reporting | `/admin/performance`: funnel with stage-to-stage drop, cycle length, time to first conversation, production by salesperson / source / agency, lost reasons from the structured field |
| Pipeline | Ten ordered stages with what each one means, positional helpers (`atOrBeyond`, `OPEN_STAGES`), a refusal on the stages that assert a unit, and the qualification gap written onto the stage entry |
| Introducing agencies | `Agency` + nested `Broker` records, append-only registrations on the lead, an auditable protection window that refuses a competing claim, and per-agency production figures counted against whoever introduced the buyer first |

### PARTIAL — works, but not all the way

| | What is missing |
|---|---|
| Filters | Stage, score, form, source, country, timeframe, budget, owner, free text and the attention flags. Not deal value |

### MISSING

| | Why it matters |
|---|---|

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

### P2 — management and optimisation ✅ *shipped*

- [x] **P2.1** Source normalisation — `sources.ts`, applied on read so nothing is migrated and
      no raw value is ever overwritten; reports, the lead filter and the export all group by
      channel instead of by spelling
- [x] **P2.2** Attribution by campaign and by ad — the same leads → qualified → reserved → sold
      → money chain one and two levels down, rendered only when the links actually carry tags
- [x] **P2.3** Reservation as its own record — deposit agreed vs deposit received, an expiry
      that is watched, a release that needs a reason, and a refusal to hold a villa for nobody
- [x] **P2.4** Contract / SPA status with the date each step was reached
- [x] **P2.6** The commission ledger — what was paid recorded one entry at a time, corrected
      with negative entries rather than deletions, and outstanding left undefined rather than
      zero when there is no agreement to compute it from
- [x] **P2.5** Configurable payment schedules — per project via `CRM_PAYMENT_SCHEDULE`, per unit
      when a buyer negotiates, and stamped onto the unit so changing the house terms never
      rewrites a deal already struck
- [x] **P2.7** Country on the lead — inferred from the dialling code, correctable from a picker,
      filterable, and its own row on the performance screen
- [x] **P2.8** Fit and engagement as two derived scores, banded differently because their
      signals behave differently, with a verdict naming which of the two expensive mistakes is
      in front of you
- [x] **P2.9** Filters on country, timeframe and budget — with exchange rates as configuration
      and no invented defaults, so the budget filter says which comparison it is actually making
- [x] **P2.10** Configurable SLA thresholds — stage stall days and the reply timer, as public
      env vars so the same number answers on the server and in the browser

### P3 — later

- [x] **P3.1** Roles that match responsibilities — head of sales, finance and marketing added,
      and the permissions moved out of eleven `isAdmin()` call sites into one capability table
- [x] **P3.3** External agent portal — `/portal`, one hashed access code per agency, buyers
      registered through the same intake gate as the website, and a view that shows an agency
      its own introductions and nothing else
- [x] **P3.2** Global search — leads, agencies (including their people) and units in one box,
      with phone numbers matched on their digits rather than their formatting
- [ ] `store.ts` split by aggregate

### P4 — hardening

Raised separately, after the CRM was working, by the only question that matters about a system
holding somebody else's customers: *can it leak, and can it be broken into?* The audit that
answered it found seven things; four were done in one pass, and the other three are named
below because leaving them unwritten is how they get forgotten.

- [x] **P4.1** Sessions that are actually sessions — the cookie was
      `sha256(name : password : a-salt-in-this-repository)`, so it never expired, was identical
      on every device, and could be computed rather than only obtained. Now a random token whose
      SHA-256 alone is stored, with an idle clock, an absolute clock, and per-device revocation
- [x] **P4.2** Passwords may be scrypt hashes (`scrypt$…`) rather than written out in the
      environment. Both forms work, so hashing is one account at a time and never a lock-out
- [x] **P4.3** Security headers and a Content Security Policy — strict and nonce-based under
      `/admin`, `/portal` and their APIs, where `connect-src 'self'` means nothing running on a
      CRM page can post the lead list anywhere; deliberately loose on the marketing site, which
      runs Tag Manager. Google's tags stopped rendering on CRM pages in the same change: they
      were inherited from the root layout, not chosen, and they were running on screens listing
      buyers by name, e-mail and phone
- [x] **P4.4** An access log — login, failed login, logout, revocation, CSV export, mailed
      backup, purge — with the account, the IP and the browser, on `/admin/security`. The CRM
      recorded what happened to a *lead* and nothing at all about access, which is the half that
      matters after something goes wrong
- [x] **P4.5** Dependencies — `shadcn`, a scaffolding CLI never imported by anything, was
      pulling an Express server and an MCP SDK into the production tree for the sake of a 95-line
      stylesheet, and seven of the eleven advisories with it. The stylesheet is vendored; the
      package is gone; Next moved 16.2.7 → 16.3.3. `npm audit` is clean, dev included
- [x] **P4.9** The screen stopped reading the database all night. Drawing one Today
      page pulled the full lead table twelve times and every villa record twelve times —
      six honest questions, each of which went and asked, and nobody had ever added up
      what one screen cost. Multiplied by a six-second auto-refresh that did not care
      whether anybody was looking, a tab left open on an office machine downloaded the
      database ten times a minute through every night and weekend. That is what
      exhausted a month of Neon's data transfer in a single working day and took the
      CRM off the air. Measured: **24 reads per render → 2**, and the refresh now runs
      only when the tab is in front AND somebody has touched it in the last ten
      minutes. **345,600 reads a day → 960, and nothing at all overnight**
- [x] **P4.6** The nightly backup is sealed, and can be read back. It went out as plain JSON —
      every lead, every phone number, every negotiated price — which made the inbox holding it the
      softest copy of the whole customer database, and no firewall touches that because the data
      walks out by design. It is now AES-256-GCM under a passphrase the mailbox does not have
      (`CRM_BACKUP_KEY`), in a text format that survives being forwarded and rewrapped.
      Two things came with it. The backup was not actually full — the project board, the agencies
      that decide who gets paid, and the blocked contacts were all missing, so a restore would have
      quietly lost them. And nothing could read one back: the route's own comment promised that
      "any one of them can restore the CRM" and no code anywhere could. `scripts/crm-restore.ts`
      does, against either backend, reporting before it writes and refusing a wrong passphrase
      rather than returning plausible nonsense
- [x] **P4.10** The interface is in the language the people reading it think in. The CRM was
      written in English by whoever built it and used in Hungarian by everybody else: the Today
      screen measured 213 visible words of which 20 were Hungarian, and "understandable on the
      first morning" was the stated goal of the whole redesign. Roughly 250 strings moved —
      every screen, every button, every filter, the work-queue sections, the ten pipeline
      stages, the qualification answers, the score verdicts, the integrity warnings and the
      daily digest. Measured after: **0 English words on eleven of the thirteen screens**, and
      what remains on the other two is data — a note somebody typed in English, a query string
      in the audit log.
      The ids stayed English throughout — `contacted`, `held-without-buyer`, `hot` — because
      they are in stored records, in bookmarked filters and in the partner API. Renaming those
      would be renaming the data to relabel a dropdown
- [x] **P4.11** WhatsApp can be written from inside the CRM. The inbound half had worked for
      months and the outbound half did not exist: a salesperson wanting to answer picked up
      their own phone, and that conversation — the one right after a real call, the one where
      the price gets agreed — was the one nobody else could read and the one that left the
      company when they did. The messages falling through that gap were not the automated
      nudges; they were the negotiation. The two `wa.me` links are gone, replaced by a composer
      that sends from the company number and lands on the timeline like a sent e-mail: reply
      timer started, answer clock stopped, an untouched lead moved to Contacted. Meta's
      24-hour free-text window is checked and said out loud BEFORE somebody writes a
      paragraph, and a message that did not go leaves no trace claiming it did
- [x] **P4.12** The React 19 correctness rules, and a size limit. 25 lint errors down to
      **zero**, and they were not style: a `<th>` component declared inside the leads table's
      render was a new component on every keystroke in a filter; the donut chart accumulated
      its arc offsets in a `let` while React rendered, which React is free to run twice and
      throw away; the masterplan and pipeline boards copied server props into state in an
      effect, painting the old state for a frame every time the page refreshed itself — on a
      board somebody is dragging cards around. The lead page read the clock during render, so
      the same lead could show "2 days" and then "3" with nothing changed, and the server's
      HTML could disagree with the browser's first paint outright.
      Two remain deliberately marked with their reasons rather than contorted around: the
      consent banner reads a cookie after hydration precisely so the page stays cacheable, and
      the hero asks the browser about reduced motion because the server has no browser to ask.
      Also: the leads list pages at `CRM_PAGE_SIZE` (50) instead of rendering every match, and
      the cross-lead note feed says out loud when it has stopped at its limit — a list that
      quietly ends at a round number reads as "this is all of it"
- [x] **P4.13** Somebody is told when it breaks. The CRM went down twice this month and both
      times it was noticed by a person trying to use it: the errors sat in the hosting logs
      the whole time, and nobody reads hosting logs. Worse, a failure could look like success —
      the audit log deliberately swallows its own errors so a failed write never fails a
      request, which meant a total database outage presented as a login endpoint answering
      401 quite normally.
      `instrumentation.ts` now catches every server error Next raises and mails it, the nightly
      sweep reports the integration that failed instead of swallowing it, and a backup the
      mailer refused says so out loud rather than only in an audit entry nobody reads on an
      ordinary Tuesday.
      Two rules shaped it. It does not touch the database, because the most important thing it
      will ever report is the database being unreachable — so the throttle is in memory, per
      instance, deliberately. And it does not flood: the same problem is mailed once an hour
      with a count, distinct problems have a ceiling, and the mail says how many it held back.
      An alarm that arrives fourteen thousand times is one people filter into a folder, and
      from that day the next real one is filed away unread
- [x] **P4.14** The API's permission gates are tested. The domain layer had four hundred
      tests and the routes had none — and the routes are where the permissions live. Fifty-five
      checks across nineteen of them, every one a deleted line away from handing the whole
      contact list to anybody who can sign in, with nothing to say so. `roleCan` had a unit
      test; that the export route ASKS it did not. The failure being guarded against is not
      somebody writing a bad rule — it is somebody refactoring a route, dropping a guard by
      accident, and every existing test staying green, because they all talk to the store
      directly and never go through the door.
      The tests drive the real handlers: they mint a real session per role, put the token in
      the cookie jar the route reads, and check what comes back. **48 of the 55 checks, on 15
      of the 19 routes** — the four left are OAuth callbacks and the cron, gated by a nonce and
      a bearer token rather than by a role.
      Two bugs surfaced immediately, and they were the same bug in opposite directions: the
      session-revoke route answered 403 to somebody who was not signed in at all, and the
      backup answered 401 to somebody who was. "Sign in" is something a caller can act on and
      "you may not" is not, and sending each to the wrong person sends them somewhere that
      cannot help
- [x] **P4.7** The login's brake became a lock, and it counts the right thing. It used to hold
      failures in a module-level Map, which on a serverless deployment is one count per
      instance: an attacker spreading requests across them earned the limit again on each, and
      the harder they hit the site the more instances — and the more attempts — they were
      handed. The count is shared now, through the settings store, which costs a read per
      attempt and is affordable because the login writes to that store anyway.
      Two counters, and the second is the one worth having. By address catches one machine
      working through a password list. **By account name catches the shape that actually
      threatens a five-person CRM** — a thousand addresses trying `owner` once each, which no
      per-address counter will ever notice. Verified against the running server: twelve
      attempts from twelve different addresses locked the account, a thirteenth address was
      turned away, and a different account from that same address still signed in.
      Lockouts double on repetition, a stale strike ages out rather than adding up (a typo on
      Monday and one on Thursday are not an attack), and a correct password clears the slate.
      With the store unreachable it fails OPEN, deliberately: the login cannot succeed without
      that store either, so failing closed would bar the door of a building already shut
- [ ] **P4.8** Two-factor authentication for admin accounts

---

## The six journeys

`web/tests/flows.test.ts` walks them end to end, and they are the acceptance test for the whole
rebuild rather than for any one part of it:

| | |
|---|---|
| 1 | A Facebook ad becomes a signed contract — intake, assignment, first contact, qualification, the middle of the funnel, a reservation, the SPA, the payment schedule, and the campaign report that says which ad did it |
| 2 | An agency introduces a buyer and still gets the credit — through a second enquiry, a refused rival registration, a duplicate merge, and the commission ledger |
| 3 | A customer comes back through another channel — recognised on the phone number alone, with the **first** source kept as the attribution |
| 4 | A salesperson leaves — the lead moves, everything they wrote stays, and it stays attributed to them |
| 5 | Two salespeople reach for the same villa — the second is refused, by name |
| 6 | The head of sales opens the CRM — and every figure opens a list of exactly that many |

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

# Lead Management — Átláthatósági audit

**Dátum:** 2026-08-18 · **Tárgy:** a `/admin` CRM teljes lead-management modulja
**Módszer:** kódszintű átvizsgálás a 34 pontos checklist alapján. **Kód nem módosult.**

Vizsgált felület: `lib/crm/*` (domain), `app/admin/(dash)/*` (oldalak), `components/crm/*` (UI),
`app/api/crm/*` + `app/api/lead|whatsapp|inbound` (be- és kimenet).

---

## 0. Összefoglaló

A rendszer **lényegesen jobb, mint egy átlagos ingatlanos CRM** azokban a pontokban, ahol a
legtöbb rendszer elbukik: minden lead kap gazdát a beérkezés másodpercében, minden lead-változás
auditált idővonalra kerül, az archiválás nem törlés, a duplikátumok magukban összefutnak, és a
reggeli digest e-mail pontosan azt a listát írja meg, amit a checklist 9. pontja kér.

**A rendszer legnagyobb hiányossága nem adathiány, hanem hozzáférés-hiány:** a „ki maradt ki"
logika **kiszámolódik, de nem lehet listázni**. A dashboard kiírja, hogy *7 lead következő lépés
nélkül*, majd a szűretlen lead-listára visz. Ugyanez a digest e-mailben már névre pontosan
megvan — csak e-mailben, nem a felületen.

### A három legfontosabb megállapítás

1. **Nincs szűrő az „elveszőben lévő" leadekre.** A `hasNoNextStep`, `isStalled`, `untouched`,
   `awaiting` szabályok készen vannak és futnak, de a lead-lista nem tud rájuk szűrni. Ez az
   egyetlen legolcsóbb és leghatásosabb javítás a rendszerben.
2. **A kézzel küldött e-mail és WhatsApp nem kerül az idővonalra.** A gombok `mailto:` és
   `wa.me` linket nyitnak, a CRM nem lát belőle semmit. A két leggyakoribb értékesítői
   csatorna a rendszer vakfoltja — a „mi történt legutóbb?" kérdés emiatt hiányos.
3. **Nincs Nurture állapot.** Aki „most még nem", az vagy Lost lesz (és többé senki nem nyúl
   hozzá), vagy örökre Qualified-ben ül. Ingatlanban a 6–18 hónapos érési idő normális —
   ez a hiány közvetlenül elvesztett üzlet.

### Státusz-eloszlás a 31 vizsgált szekcióban

| | Szekciók |
|---|---|
| ✅ Teljesül | 4, 5, 7, 15, 23 (részben), duplikátumkezelés, ownership, kommunikációs történet |
| 🟡 Részben teljesül | 1, 2, 3, 6, 8, 9, 10, 12, 13, 14, 16, 18, 19, 20, 21, 24, 25, 26, 27, 28 |
| ❌ Nem teljesül | 11 (external agent), 17 (nurture), 22 (salesperson performance) |

---

## 1. Rendszer-áttekintés

**Adatmodell:** egy `Lead` dokumentum tartalmaz mindent — jegyzetek, teendők, aktivitás-history,
kiküldött levelek, qualification. Nincsenek külön táblák (`docs/DATA-MODEL.md`). Ez a döntés jó:
egy lead egy olvasás, nincs join, az idővonal mindig teljes.

**Pipeline:** 6 fázis — `new → contacted → qualified → reserved → won` + `lost`.

**Beérkezés:** weboldal-űrlapok (`/api/lead`), WhatsApp webhook (`/api/whatsapp`), inbound e-mail
(`/api/inbound`), kézi felvitel (`/api/crm/leads`). Mind ugyanazon a `upsertLeadFromPayload`
kapun megy be, ami kontakt-egyezés alapján **meglévő leadre fűz rá**, nem hoz létre duplikátumot.

**Automatizmus:** napi cron (`/api/crm/cron`) → e-mail szekvencia (6 lépés, 0–60 nap) + reggeli
digest + Google Tasks szinkron.

**Jogosultság:** `admin` / `agent` / `viewer` — env-ből, nincs user-tábla.

---

# RÉSZ I. — A CHECKLIST KITÖLTVE

Jelölés: ✅ teljesül · 🟡 részben · ❌ nem teljesül · ➖ nem releváns
Fájl-hivatkozások a `02 CRM/web/` mappához képest.

---

## 1. Lead lista / főnézet — 🟡 Részben

`app/admin/(dash)/leads/page.tsx` + `components/crm/leads-table.tsx`

| Elvárás | Státusz | Megjegyzés |
|---|---|---|
| Lead neve | ✅ | Első oszlop, kiemelve |
| Telefonszám | 🟡 | Csak ha nincs e-mail — `l.email \|\| l.phone \|\| '—'`, egy sorban |
| Email | 🟡 | Ugyanaz a cella, felváltva a telefonnal |
| Lead forrása | ✅ | Source oszlop (`source \|\| utm_source \|\| 'direct'`) |
| Kampány / hirdetés | ❌ | `utm_campaign` tárolva, listában nem jelenik meg |
| Érdeklődési projekt / termék | ✅ | Enquiry oszlop alsó sora: `villa \|\| form_origin` |
| Lead státusz | ✅ | Stage badge |
| Lead minősítése / prioritás | ✅ | Score badge (hot/warm/cold) |
| **Felelős sales személy** | ❌ | **A listában sehol nem látszik.** Csak szűrni lehet rá |
| Utolsó kapcsolatfelvétel időpontja | ❌ | Nincs oszlop; az adat megvan (`history`), csak nincs kiszámolva |
| Következő feladat időpontja | ❌ | Nincs oszlop |
| Következő lépés | ❌ | Nincs oszlop; csak a „no next step" jelzés (van/nincs) |
| Lead kora | 🟡 | „Received" dátum látszik, kor napokban nem |
| Túl régóta nem történt semmi | ✅ | `· stalled Xd` jelzés a Received oszlopban (`isStalled`) |
| Fontos leadek vizuális kiemelése | 🟡 | Score badge színes, de a sor maga nem |
| Nincs felesleges mező | ✅ | 7 oszlop, egy sem felesleges |
| 5–10 mp alatt érthető | 🟡 | A *ki/honnan/hol tart* igen; a *ki kezeli / mi a következő lépés / mikor* nem |

**Current state:** a lista 7 oszlopa a lead azonosítására és fázisára fókuszál. A „stalled" és
„no next step" jelzés (`components/crm/leads-table.tsx:150-160`) jó irányba mutat, de bináris:
megmondja, hogy baj van, nem mondja meg, mi a teendő és mikor.

**Problem:** a checklist négy legfontosabb oszlopa hiányzik — **owner, utolsó kontakt, következő
lépés, következő lépés dátuma**. Egy 3 fős csapatnál ez azt jelenti, hogy a lista nem munkalista,
hanem címtár: minden lead megnyitása külön kattintás ahhoz, hogy kiderüljön, egyáltalán az enyém-e.

**Recommended change:** két oszlop hozzáadása — **Owner** és **Next** (a legkorábbi nyitott task
címe + határidő, lejárt esetén pirossal). Ez a `Lead` dokumentumból számolható, nincs szükség új
mezőre. Az „Enquiry" és „Source" oszlop összevonható, hogy ne nőjön a szélesség.

**Priority:** High · **Complexity:** Small
**Affected files:** `components/crm/leads-table.tsx`, `app/admin/(dash)/leads/page.tsx`

---

## 2. Egy lead adatlapja — 🟡 Részben (erős)

`components/crm/lead-workspace.tsx` (778 sor) — a rendszer legjobban megcsinált képernyője.

### Alapadatok

| Mező | Státusz |
|---|---|
| Név / Telefon / Email / WhatsApp | ✅ |
| Ország | ❌ Nincs tárolva |
| Nyelv | 🟡 Nem tárolt, hanem **kikövetkeztetett** (`lib/crm/language.ts` — telefon-előhívó > böngésző-nyelv > e-mail domain). Okos megoldás, de nem javítható kézzel |
| Lead forrás / Kampány | ✅ Attribution kártya: source, medium, campaign, term, content, landing URL |
| Létrehozás dátuma | ✅ |
| Felelős sales személy | ✅ Owner select a Status kártyán |

### Érdeklődés

| Mező | Státusz |
|---|---|
| Melyik projekt érdekli | ➖ Egy projekt van (Longevity Resort) |
| Melyik ingatlan / unit | 🟡 `villa` szabad szöveg a leaden; a tényleges unit-kötés a masterplanon él (`buyerLeadId`) — **két külön hely** |
| Típus (1BR/villa/condo) | ➖ Villa-katalógus (`lib/crm/villas.ts`) fedi le |
| Befektetési vagy saját használat | ✅ `qualification.purpose` |
| Tervezett budget | ✅ `qualification.budget` + `currency` (4 deviza) |
| Vásárlási időhorizont | ✅ `qualification.timeframe` |
| Finanszírozási mód | ✅ `qualification.financing` |
| Preferált kommunikációs nyelv | 🟡 Csak kikövetkeztetve |
| Fontos igények / megjegyzések | ✅ Jegyzetek |

Plusz, amit a checklist nem is kért, de itt van: **döntéshozói státusz**, **járt-e már Samuin**,
**motiváció**, **objection** — 8 mező, mind dropdown, mind azonnal mentődik (nincs Save gomb),
mind naplózódik az idővonalra (`store.ts:654-696`). Ez a checklist 8. pontjának pontos teljesítése.

### Aktuális helyzet

| Mező | Státusz |
|---|---|
| Jelenlegi sales stage | ✅ |
| Lead prioritás | ✅ Score |
| Utolsó kapcsolatfelvétel | 🟡 Az idővonalon látszik, de nem kiemelt mezőként |
| Utolsó kommunikáció összefoglalója | 🟡 Az idővonal első eleme — le kell görgetni hozzá |
| Következő lépés | 🟡 = a legkorábbi nyitott task, a **jobb hasáb alján** |
| Következő lépés határideje | ✅ Task due date |
| Következő lépés felelőse | ❌ **A `Task` típusnak nincs assignee mezője** (`by` = ki hozta létre) |
| Elakadás / objection | ✅ `qualification.objection` |
| Deal várható értéke | ✅ `value` (THB) |
| Closing valószínűség | ❌ Nincs |

**Current state:** minden lényeges adat egy oldalon van, két hasábban. Bal: Contact →
Kapcsolódó enquiry-k → Attribution → Qualification → Jegyzetek+idővonal. Jobb: Status →
Válasz-követés → Dokumentumok → Automata szekvencia → Teendők → Danger zone.

**Problem:** a **sorrend nem a fontosság sorrendje**. Az „Attribution" (UTM-mezők, amit
naponta egyszer néz meg valaki) a Qualification és a jegyzetek FÖLÖTT van, a „Következő lépés"
(Teendők) pedig a jobb hasáb legalján, a dokumentumok és az automata szekvencia után. A
checklist 29. pontja (10 másodperces teszt) ezen bukik el: a *mi történt legutóbb* és a *mi a
következő lépés* a képernyő két legaljára esik.

**Recommended change:** egy **összefoglaló sáv az adatlap tetején, teljes szélességben**:
`Owner · Stage · Score · Deal value · Utolsó kontakt (X napja, mi volt) · Következő lépés (mi, mikor)`.
Ez semmilyen új adatot nem igényel, tisztán elrendezés. Az Attribution kártya kerüljön collapse alá.

**Priority:** High · **Complexity:** Small
**Affected files:** `components/crm/lead-workspace.tsx`, `app/admin/crm.css`

**Második probléma:** a Task-nak nincs felelőse. Egy leadet átadhatok a kollégának (owner
váltás), de a rajta lévő teendő nem megy vele, és a Follow-ups oldal mindenki teendőjét egy
kupacban mutatja.
**Recommended change:** `Task.owner?: string` mező + owner-szűrő a Follow-ups oldalon; új
task alapból a lead ownerére esik.
**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/types.ts`, `lib/crm/store.ts` (`addTask`), `app/admin/(dash)/tasks/page.tsx`

---

## 3. Sales pipeline — 🟡 Részben

`lib/crm/types.ts:78` (STAGES), `components/crm/pipeline-board.tsx`

Jelenleg: **NEW → CONTACTED → QUALIFIED → RESERVED → WON** + **LOST**.
A checklist javaslata 9 fázis + 3 lezáró.

| Elvárás | Státusz | Megjegyzés |
|---|---|---|
| Minden stage egyértelműen definiálva | 🟡 A kódban igen (`docs/KEZIKONYV.md` 11. fejezet), a felületen nincs magyarázat |
| Nincs két hasonló jelentésű stage | ✅ |
| Nincs feleslegesen sok stage | ✅ **Ez a rendszer erőssége, nem hiányossága** |
| Minden lead pontosan egy stage-ben | ✅ |
| Egyértelmű, mikor lép tovább | 🟡 Nincs kényszerítve; a `missingQualification` megmutatja a hiányt, de nem blokkol |
| Egyértelmű, ki módosíthatja | ✅ `canEdit()` — admin + agent |
| Vizuálisan áttekinthető | ✅ Drag & drop kanban |
| Stage-enként leadszám | ✅ + hot-szám is |
| **Stage-enként potenciális érték** | ❌ Nincs összegezve |
| Mennyi ideje van a stage-ben | 🟡 `stageAgeDays()` létezik, a **kanban-kártyán nem jelenik meg** (a lista-nézetben igen) |
| Túl sokáig egy stage-ben | 🟡 Ugyanaz — `isStalled` a listában látszik, a boardon nem |

**Current state:** 6 fázis, tudatosan rövidre szabva. A „Presentation / Meeting" nem fázis,
hanem **naplózott esemény** (`TOUCHES` — telefon, videóhívás, meeting, helyszíni bejárás,
WhatsApp), ami valójában pontosabb: egy meeting megtörténte nem tolja előre az üzletet, a
minősítés igen.

**Problem 1 — hiányzó NURTURE:** lásd a 17. szekciót. Ez az egyetlen fázis, aminek a hiánya
tényleges üzletvesztést okoz.

**Problem 2 — NEGOTIATION:** a `reserved` és a `qualified` közé nincs semmi. Egy 8–12 hónapos
ingatlan-üzletben az ártárgyalás és a szerződéskötés önálló, mérhető szakasz. Jelenleg minden
tárgyalás alatt álló üzlet a `qualified` kupacban ül, együtt azzal, akivel egyszer beszéltünk.

**Recommended change:** **ne legyen 9 fázis.** Két fázis hozzáadása elég:
`qualified → negotiation → reserved`, valamint a `nurture` mint önálló lezáró állapot a
`lost` mellett. Végeredmény: **NEW → CONTACTED → QUALIFIED → NEGOTIATION → RESERVED → WON**
+ **NURTURE / LOST**. A `STAGE_MAX_DAYS` és az `ACTIVE_STAGES` ehhez igazítandó.

**Priority:** High · **Complexity:** Medium (adatmigráció nem kell, de a `rules.ts`,
`sequence.ts`, `analytics.ts` fázis-rangsorai mind érintettek)
**Affected files:** `lib/crm/types.ts`, `lib/crm/rules.ts`, `lib/crm/sequence.ts`,
`lib/crm/analytics.ts`, `components/crm/pipeline-board.tsx`

**Problem 3 — kanban-kártya információhiánya:** a kártyán név, villa/form, source, score és
két nyíl van. Nincs rajta **owner**, **stage-ben töltött idő**, **deal érték**.
**Recommended change:** owner-monogram + `Xd` a fázisban + érték a kártya lábába; oszlopfejlécbe
a fázis összértéke.
**Priority:** Medium · **Complexity:** Small
**Affected files:** `components/crm/pipeline-board.tsx`, `app/admin/(dash)/pipeline/page.tsx`

---

## 4. New lead kezelés — ✅ Teljesül

`app/api/lead/route.ts`, `lib/crm/store.ts:151-320`

| Elvárás | Státusz |
|---|---|
| Minden új lead automatikusan bekerül | ✅ Weboldal, WhatsApp, inbound e-mail, kézi |
| Creation timestamp | ✅ `created_at` + `submitted_at` |
| Lead source automatikusan | ✅ `lib/source.ts` — sessionStorage-ben őrzi a UTM-et az egész látogatásra |
| Campaign / UTM | ✅ Mind az 5 UTM-mező + landing URL |
| Automatikus felelős-kijelölés | ✅ `assignOwner` → `pickOwner` (`lib/crm/agents.ts`) |
| Új lead felelős nélkül nem maradhat | 🟡 Csak ha van roster konfigurálva (`CRM_AGENTS`). Ha üres, a lead gazdátlan marad |
| Új lead kiemelve jelenik meg | ✅ Dashboard kapszula + nav badge |
| Látható, mennyi ideje nem reagált senki | ✅ `untouched` = 1 napnál régebbi, jegyzet és task nélküli `new` |
| Beállítható first-response SLA | 🟡 `STAGE_MAX_DAYS.new = 1` — **kódban, napban** |
| SLA túllépés figyelmeztetés | ✅ Kapszula + nav badge + digest |
| Duplikált lead felismerés | ✅ Automatikus — nem figyelmeztet, hanem **rá is fűzi** a meglévő leadre |

**Az assignment logika (`pickOwner`) kiemelendő:** nyelv szerint szűr először (spanyol
érdeklődő spanyolul beszélő értékesítőhöz), és **azon belül** a legkevesebb nyitott leadet
vivőhöz oszt. Állapotmentes, nem tud elcsúszni, magától kiegyensúlyozódik. Ez jobb, mint a
klasszikus round-robin.

**Problem:** az SLA **1 nap**, és nem állítható a felületről. Ingatlanban a first response
mérőszáma percben/órában van; a lead-válaszidő kutatások szerint az 5 perc és az 1 óra között
nagyságrendi különbség van a konverzióban. A rendszer méri is (`speed.within1hPct` az
analitikán), de a *riasztás* csak 24 óra után szólal meg.

**Recommended change:** `CRM_SLA_MINUTES` env (alapérték 60), és az `untouched` küszöb erre
álljon. Az `attentionCounts` és a digest ugyanezt használja.

**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/rules.ts`, `lib/crm/store.ts` (`attentionCounts`), `lib/crm/digest.ts`

---

## 5. Lead ownership / felelősség — ✅ Teljesül (láthatósági hiánnyal)

| Elvárás | Státusz |
|---|---|
| Pontosan egy elsődleges owner | ✅ |
| Owner minden fontos nézetben látható | ❌ **Csak az adatlapon.** Lista: nem. Pipeline: nem. Follow-ups: nem |
| Átadás története megmarad | ✅ `assigned` aktivitás az idővonalon, névvel és időbélyeggel |
| Ki és mikor adott át | ✅ |
| Lead nem maradhat owner nélkül | 🟡 Nincs kényszerítve, csak detektálva |
| Újraosztás egyszerű | ✅ Egy dropdown az adatlapon |
| Manager látja az owner nélküli leadeket | 🟡 **Csak a Payments oldal alján**, az integritás-blokkban (`store.ts:1523`) — ami admin-only és egy pénzügyi képernyő |
| Manager látja az inaktív saleseshez tartozó leadeket | ❌ Nincs ilyen nézet |

**Current state:** az owner-mező szerverszinten validált (`app/api/crm/leads/[id]/route.ts:38` —
csak a roster nevei fogadhatók el, szabad szöveg nem), a történet auditált, az átadás egy
kattintás. Az adat tehát megbízható. A **megjelenítés** hiányzik.

**Problem:** owner nélküli aktív lead = senki dolga. Ez a rendszer detektálja
(`integrityIssues` → `lead-without-owner`), de olyan helyre teszi, ahova egy sales manager
soha nem néz be. Ha valaki kilép a cégtől és kikerül a `CRM_AGENTS` env-ből, a leadjei
megtartják a nevét, de **semmilyen nézet nem listázza őket**.

**Recommended change:**
1. Owner oszlop a lead-listán (lásd 1. szekció).
2. Az owner-szűrőbe egy **„Unassigned"** opció (`owner=__none__`).
3. Egy **Needs Attention** manager-nézet (lásd 27. szekció), ami az `integrityIssues()` +
   `attentionCounts()` eredményét egy helyre hozza — beleértve a rosteren kívüli ownert.

**Priority:** Critical · **Complexity:** Small
**Affected files:** `app/admin/(dash)/leads/page.tsx`, `lib/crm/store.ts` (`LeadFilter`),
`components/crm/leads-table.tsx`

---

## 6. Next Action — 🟡 Részben (a rendszer leggyengébb pontja a legfontosabb helyen)

`lib/crm/rules.ts:64` (`hasNoNextStep`), `app/admin/(dash)/tasks/page.tsx`

| Elvárás | Státusz |
|---|---|
| Minden aktív leadnél van Next Action | 🟡 Nincs kikényszerítve, de mérve van |
| Next Action rövid és egyértelmű | ✅ Task cím |
| Van dátuma | 🟡 **Opcionális** — a task létrehozásakor a due date üresen hagyható |
| Van felelőse | ❌ Nincs assignee mező |
| Lejárt feladatok látszanak | ✅ Follow-ups oldal „Overdue" csoport, pirossal |
| Mai feladatok külön | ✅ „Due today" |
| Következő 7 nap | 🟡 Egyetlen „Upcoming" csoport, időbeli tagolás nélkül |
| Lead nem tud eltűnni next step nélkül | 🟡 Jelezve van, nem blokkolva |
| **A CRM külön listázza a Next Action nélküli leadeket** | ❌ **Kiszámolja a darabszámot, de nem lehet listázni** |

**Current state:** a `hasNoNextStep(lead)` szabály pontos: aktív fázis + nincs nyitott task +
nem fut válasz-időzítő. Ez fut a nav badge-ben, a dashboard kapszulában és a digest e-mailben.

**Problem — ez a legfontosabb hiba a rendszerben:** a dashboardon megjelenik, hogy
`7 következő lépés nélkül`, a kapszulára kattintva pedig a **szűretlen** `/admin/leads` oldal
nyílik meg (`components/crm/welcome-hero.tsx:78`). A felhasználó megkapja a számot, és utána
kézzel keresheti meg, melyik az a 7. Ugyanez igaz mind az öt kapszulára (overdue, untouched,
stalled, noNext, awaiting).

A `LeadFilter` (`store.ts:53`) nem ismer ilyen szűrőt, a lead-lista `searchParams`-a sem.

**Recommended change:** egy `flag` query-paraméter a lead-listán:
`?flag=no-next | stalled | untouched | awaiting | overdue`, ami a `rules.ts` már meglévő
tiszta függvényeit alkalmazza szűrőként. A kapszulák és a nav badge-ek erre mutassanak.
**Ez kb. 30 sor kód, és önmagában megoldja a checklist 6., 9., 26. és 27. pontjának a felét.**

**Priority:** Critical · **Complexity:** Small
**Affected files:** `app/admin/(dash)/leads/page.tsx`, `lib/crm/store.ts` (`listLeads`),
`components/crm/welcome-hero.tsx`, `components/crm/crm-nav.tsx`

**Második probléma:** a Next Action határidő opcionális. Egy dátum nélküli teendő nem
következő lépés, hanem kívánság — nem jelenik meg sem az Overdue, sem a Due today listában,
csak az „Upcoming" végén.
**Recommended change:** a due date legyen kötelező (alapérték: holnap), vagy a dátum nélküli
taskok kapjanak külön „Nincs határidő" csoportot a Follow-ups oldalon.
**Priority:** High · **Complexity:** Small
**Affected files:** `components/crm/lead-workspace.tsx`, `app/admin/(dash)/tasks/page.tsx`

---

## 7. Kommunikációs történet — ✅ Teljesül (két lyukkal)

`lib/crm/types.ts:230` (Activity), `store.ts:710` (`logTouch`)

| Elvárás | Státusz |
|---|---|
| Telefonhívás rögzíthető | ✅ **Két külön gomb**: „Spoke by phone" és „No answer" |
| Email rögzíthető | 🟡 Az **automata** levelek igen, a **kézzel írt** nem |
| WhatsApp rögzíthető | 🟡 Van „WhatsApp" log-gomb, de a „Draft WhatsApp" gomb nem naplóz |
| Meeting | ✅ |
| Videóhívás | ✅ |
| Jegyzet | ✅ |
| Timestamp minden activityn | ✅ |
| Ki végezte | ✅ `by` mező — üres, ha a rendszer csinálta |
| Kronologikus timeline | ✅ Jegyzetek + history egyben, fordított időrendben |
| Legújabb activity megtalálható | ✅ Legfelül |
| Nem kell több oldalt megnyitni | ✅ |

**A `TOUCHES` megoldás kiemelendő:** hat gomb, egy kattintás, a jegyzetmezőbe írt szöveg
átmegy részletként. A `reached` flag (elértük-e ténylegesen) **strukturált mező, nem szövegből
kiolvasott** — ezért tud rá támaszkodni a szekvencia-logika: aki telefonon beszélt az
ügyféllel, annak leáll az automata levelezés (`sequence.ts:60`), a csöngetés viszont nem
számít kontaktusnak. Ez pontosan az a részlet, amit a legtöbb CRM elront.

**Problem — a két leggyakoribb csatorna vakfolt:** az adatlapon a „✉ Email", „Draft email",
„WhatsApp" és „Draft WhatsApp" gombok `mailto:` és `https://wa.me/` linket nyitnak. A CRM
ezekből **semmit nem lát**. Ha az értékesítő megnyomja a „Draft WhatsApp"-ot, ír egy hosszú
üzenetet és elküldi, a leaden **nem történt semmi**: az idővonal üres marad, a lead továbbra is
„no next step", és az automata szekvencia is fut tovább, mert nincs `reached` esemény.

**Recommended change:** a „Draft email" / „Draft WhatsApp" gomb kattintáskor tegyen fel egy
`logTouch`-ot is (`whatsapp`, illetve egy új `email-sent` touch), opcionálisan egy „Elküldted?"
megerősítéssel. Optimista naplózás jobb, mint semmi: az idővonalon az szerepel, hogy
*„WhatsApp-üzenet írása elindítva"*, ami helytálló és hasznos.

**Priority:** Critical · **Complexity:** Small
**Affected files:** `components/crm/lead-workspace.tsx`, `lib/crm/types.ts` (`TOUCHES`),
`lib/crm/store.ts` (`logTouch`)

---

## 8. Lead qualification — ✅ Teljesül

`lib/crm/types.ts:120-215`, `store.ts:654`

| Elvárás | Státusz |
|---|---|
| Egyszerű qualification rendszer | ✅ 8 mező, mind dropdown vagy szám |
| Budget | ✅ + deviza (THB/EUR/USD/GBP) — **a saját devizájában tárolva**, nem átváltva |
| Vásárlási időtáv | ✅ 5 opció |
| Buying intent | ✅ `motivation` (6 opció) + `purpose` |
| Döntéshozói státusz | ✅ `decision` |
| Befektetési cél | ✅ `purpose` |
| Preferált ingatlan | ✅ `villa` mező |
| Ország / nationality / language szegmentáció | 🟡 **Csak nyelv, csak kikövetkeztetve, és nem szűrhető** |
| Hot / Warm / Cold | ✅ Automatikus az űrlaptípusból (`scoring.ts`), kézzel felülírható, AI-triage újraértékeli a beérkező válaszból |
| Nem igényel sok manuális kitöltést | ✅ Minden opcionális, minden azonnal mentődik |

**Problem 1:** a qualification-mezőkre **nem lehet szűrni**. „Mutasd azt a 12 embert, akinek
6 hónapon belüli időtávja és 10M THB feletti budgetje van" — nem megválaszolható kérdés a
felületen, pedig az adat ott van.

**Recommended change:** budget-sáv és timeframe szűrő a lead-listára; ezek a `LeadFilter`-be
egyszerűen beilleszthetők.
**Priority:** Medium · **Complexity:** Small
**Affected files:** `lib/crm/store.ts` (`LeadFilter`, `listLeads`), `app/admin/(dash)/leads/page.tsx`

**Problem 2:** nincs `country` mező. Egy nemzetközi ingatlanprojektnél a nemzetiség az egyik
legerősebb szegmentációs változó (fizetési szokás, jogi struktúra, szezonalitás). A telefonszám
előhívója alapján kikövetkeztethető, de nem tárolt és nem javítható.
**Recommended change:** `country?: string` a leaden, alapértéke az előhívóból származtatva,
kézzel felülírható; szűrő + analitikai bontás.
**Priority:** Medium · **Complexity:** Small
**Affected files:** `lib/crm/types.ts`, `lib/crm/language.ts`, `components/crm/lead-workspace.tsx`

---

## 9. Prioritás — 🟡 Részben

| Elvárás | Státusz |
|---|---|
| Hot leadek látszanak | ✅ Score badge, pipeline oszlopfejléc hot-száma |
| Friss leadek prioritást kapnak | ✅ Alapértelmezett rendezés + untouched kapszula |
| Lejárt follow-upok prioritást kapnak | ✅ Follow-ups oldal Overdue csoportja |
| Nagy értékű dealek kiemelhetők | ❌ A `value` mező nem szerepel egyetlen listában sem |
| Reservation / negotiation közeli leadek kiemelhetők | 🟡 Csak stage-szűrővel |
| Hosszú ideje nem kontaktált leadek listázhatók | ❌ A `stalled` jelzés látszik, de nem szűrhető |
| **„Who should I contact now?" nézet** | 🟡 **Létezik — de csak e-mailben** |

**Current state:** a `lib/crm/digest.ts` **pontosan ezt a nézetet építi fel**, hét prioritási
csoportban, a figyelmen kívül hagyás költsége szerint rendezve:

1. `unanswered` — ők írtak nekünk, és senki nem válaszolt
2. `overdue` — lejárt teendők
3. `untouched` — új lead, amit senki nem vett fel
4. `warming` — **tegnap megnyitotta a brossúrát vagy kattintott** ← a legértékesebb csoport
5. `awaiting` — mi írtunk, ők elhallgattak
6. `stalled` — beragadt fázisban
7. `noNext` — nincs semmi ütemezve

Ez **naponta egyszer, e-mailben megy ki** — és csak akkor, ha van benne valami (ami jó döntés).
A felületen ez a lista sehol nem érhető el.

**Problem:** a rendszer legjobb prioritási logikája egy olyan csatornán él, amit nem lehet
frissíteni, szűrni, kipipálni vagy megnyitni. Aki délután háromkor kérdezi meg magától, hogy
„kit hívjak most", annak nincs válasza a felületen.

**Recommended change:** egy **„Ma" (Today / Kit hívjak most?) oldal** a dashboard helyén vagy
mellette, ami a `buildDigest()` már meglévő kimenetét rendereli, csoportonként, kattintható
lead-linkekkel és inline „Log: hívás" gombokkal. **A logika kész van — ez tisztán megjelenítés.**

**Priority:** Critical · **Complexity:** Small–Medium
**Affected files:** új `app/admin/(dash)/today/page.tsx`, `lib/crm/digest.ts` (a `buildDigest`
már exportált és tiszta), `components/crm/crm-nav.tsx`

---

## 10. Lead source — 🟡 Részben

| Csatorna | Támogatás |
|---|---|
| Direct website / Organic | ✅ `source='direct'` alapérték |
| Meta / Google / Instagram / Facebook / TikTok / YouTube Ads | 🟡 **Csak amit a UTM-ben kapunk** — nincs normalizált lista |
| Property portal | 🟡 UTM-en keresztül |
| External Agent | ❌ Csak mint kézi „agent" szöveg |
| Referral | ✅ Kézi forrásopció |
| Event / Walk-in | ✅ Kézi forrásopció (`walk-in`) |
| Other | ✅ |

| Ellenőrzés | Státusz |
|---|---|
| Source kötelező vagy automatikus | ✅ Automatikus (`direct` a fallback) |
| UTM adatok tárolhatók | ✅ Mind az 5 |
| Campaign tárolható | ✅ |
| External agent neve tárolható | ❌ |
| Lead source riportálható | ✅ Analitika: „Leadek forrás szerint" |
| Source → Qualified mérhető | 🟡 Csak stage-bontásban, forrásra vetítve nem |
| Source → Reservation mérhető | ❌ A funnel nem szűrhető forrásra |
| Source → Sale mérhető | 🟡 `store.ts` `reports().bySource` kiszámolja (won, lost, winRate, wonValue) — **de ez a függvény sehol nincs megjelenítve** |

**Problem 1 — normalizálatlan forrásértékek:** a `source` az, amit a `?source=` vagy
`utm_source` paraméterben kapunk, korlátozás nélkül. `facebook`, `Facebook`, `fb`, `FB_ads`
négy külön sor lesz a riportban. A `topN()` (`analytics.ts:104`) 8 sor után „Egyéb"-be dobja a
maradékot, tehát a szétszórt írásmód **elrejti** a valódi teljesítményt.

**Recommended change:** normalizáló függvény a beérkezésnél (kisbetűsítés + szinonima-térkép:
`fb|facebook|meta → meta`, `ig|instagram → instagram`, stb.), ismeretlen érték `other`-ként
megőrizve az eredetivel együtt.
**Priority:** Medium · **Complexity:** Small
**Affected files:** `lib/crm/store.ts` (`createLeadFromPayload`), új `lib/crm/sources.ts`

**Problem 2 — a forrás-teljesítmény nincs megjelenítve.** A `reports()` függvény
(`store.ts:1736`) forrásonként kiszámolja a won/lost/winRate/wonValue értékeket — és
**egyetlen oldal sem hívja meg**. Lásd a 31. szekciót (halott kód).
**Priority:** High · **Complexity:** Small
**Affected files:** `app/admin/(dash)/analytics/page.tsx`, `lib/crm/analytics.ts`

---

## 11. External agent / broker leadek — ❌ Nem teljesül

| Elvárás | Státusz |
|---|---|
| Látható, ha lead external agenttől érkezett | 🟡 Csak úgy, hogy a kézi felvitelnél a forrás `agent` |
| Agent neve rögzítve | ❌ |
| Agency neve rögzítve | ❌ |
| Agent kontaktadatai | ❌ |
| Agenthez tartozó leadek listázhatók | ❌ |
| Agenthez tartozó eladások listázhatók | ❌ |
| Commission információ | ❌ |
| Lead registration dátuma | ❌ |
| Duplikált agent/direct lead konfliktus | ❌ |

**Current state:** a teljes modul hiányzik. A kódban egyetlen nyoma van: a kézi lead-felvitel
forrás-listájában szerepel az `'agent'` szó (`components/crm/new-lead-form.tsx:8`), és két
kommentben a „broker referral" kifejezés. Sem `agency`, sem `commission`, sem
`registration_date` mező nincs sehol.

**Problem:** ha a projekt brókereken keresztül is értékesít — ami thai luxusingatlan-piacon
a normális modell —, akkor jelenleg **nincs semmi**, ami megvédené a rendszert a klasszikus
konfliktustól: a bróker beregisztrálja az ügyfelet, két héttel később ugyanaz az ügyfél kitölti
a weboldal űrlapját, a `upsertLeadFromPayload` egyetlen leadre fűzi a kettőt (helyesen), és
utána **nem eldönthető, kié a jutalék**. A `merged` aktivitás megőrzi, hogy volt két rekord, de
a regisztráció időrendjét nem emeli ki, és a jutalék-igényt nem kezeli.

**Recommended change (ha van bróker-értékesítés):**
- `Lead.agent?: { name: string; agency?: string; email?: string; phone?: string; registered_at: string }`
- Bróker-lista nézet: agentenként a leadek, a fázisaik és a lezárt eladások.
- A duplikátum-összefonásnál: ha az egyik oldalon van `agent`, a másikon nincs, az összefűzött
  leaden **maradjon meg mindkettő ténye** és a regisztrációk időbélyege, kiemelt figyelmeztetéssel.
- Commission: a masterplan `VillaRecord`-ba `commissionPct` / `commissionPaid`, mert a jutalék
  az eladott unithoz tartozik, nem a leadhez.

**Priority:** High, ha van bróker-csatorna · Low, ha nincs. **Ezt üzleti döntésként kell
megválaszolni, mielőtt bármi fejlesztés indul** — ez a legnagyobb egyben lévő hiányzó modul.
**Complexity:** Medium
**Affected files:** `lib/crm/types.ts`, `lib/crm/store.ts`, új `app/admin/(dash)/agents/page.tsx`,
`components/crm/new-lead-form.tsx`, `components/crm/lead-workspace.tsx`

---

## 12. Follow-up rendszer — 🟡 Részben

| Elvárás | Státusz |
|---|---|
| Follow-up egyszerűen létrehozható | ✅ Cím + dátum + gomb az adatlapon |
| Follow-up dátum megadható | ✅ (opcionális — lásd 6. szekció) |
| Reminder működik | 🟡 **Csak a napi digest e-mail.** Nincs in-app értesítés, nincs push |
| Overdue follow-up külön látható | ✅ |
| Follow-up történet megmarad | ✅ A kipipált taskok megmaradnak, „Recently completed" |
| Ismétlődő follow-up | ❌ |
| Nurture leadekhez hosszabb távú follow-up | ❌ |
| Manager látja a lejárt follow-upokat | 🟡 Mindenkiét egy kupacban, owner-bontás nélkül |

**Current state:** egy automatizmus létezik: a „✉ Email sent — awaiting reply" gomb
3 napra kitesz egy „Follow up — no reply yet" teendőt (`store.ts:1073`), és ha megjön a válasz
vagy telefonon elérik az ügyfelet, **magától kipipálja** (`logTouch`, `store.ts:735`). Ez jó
minta — de ez az egyetlen ilyen.

**Problem:** nincs stage-alapú automatikus teendő. Aki `qualified`-be kerül, annak nem
keletkezik semmi. Aki `reserved`-be kerül, annak sem. A rendszer tehát pontosan tudja, hogy
„ennél a leadnél nincs következő lépés", de nem tesz érte semmit.

**Recommended change:** stage-belépéskor javasolt teendő automatikus létrehozása, fázisonként
konfigurálható címmel és határidővel (pl. `qualified` → „Ajánlat küldése", +2 nap;
`negotiation` → „Tárgyalás lezárása", +7 nap). A `updateLead` stage-ága már látja a váltást,
ide egy hívás kell.

**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/store.ts` (`updateLead`), `lib/crm/rules.ts`

---

## 13. Sales task list — 🟡 Részben

`app/admin/(dash)/tasks/page.tsx`

| Elvárt csoport | Státusz |
|---|---|
| New Leads | ❌ Nincs a Follow-ups oldalon |
| Contact Today | ❌ |
| Overdue | ✅ |
| Follow-up Today | ✅ („Due today") |
| Meetings Today | ❌ Nincs meeting-időpont mint típus |
| Hot Leads | ❌ |
| Negotiation | ❌ (nincs ilyen fázis) |
| Reservations Pending | ❌ |
| Leads Without Next Action | ❌ |

**Current state:** négy csoport — Overdue / Due today / Upcoming / Recently completed. Minden
felhasználó **minden teendőjét** látja, owner-szűrő nélkül.

**Problem:** a Follow-ups oldal nem a saleses napjának kiindulópontja, hanem egy teendőlista.
A checklist 13. pontja lényegében a 9. pont („Ma" nézet) megvalósítási formáját írja le — a
kettő ugyanaz a fejlesztés.

**Recommended change:** a 9. szekcióban javasolt **„Ma" oldal** fedje le ezt is, a `buildDigest()`
csoportjaival + `New leads` és `Hot leads` szekciókkal kiegészítve; a Follow-ups oldal maradjon
a tiszta teendőlista, de kapjon **owner-szűrőt** és „Csak az enyém" alapértelmezést.

**Priority:** High · **Complexity:** Small
**Affected files:** `app/admin/(dash)/tasks/page.tsx`, `lib/crm/store.ts` (`allTasks`)

---

## 14. Search / filter — 🟡 Részben (a legnagyobb egyszerű nyereség)

`app/admin/(dash)/leads/page.tsx:33-46`, `lib/crm/store.ts:53` (`LeadFilter`)

| Szűrő | Státusz |
|---|---|
| Név | ✅ szabadszavas `q` |
| Telefonszám | ✅ `q` |
| Email | ✅ `q` |
| Owner | ✅ (de nincs „Unassigned" opció, és csak 2+ fős roszternél jelenik meg) |
| **Lead source** | ❌ **A `LeadFilter` támogatja (`store.ts:59`), a felület nem teszi ki** |
| Campaign | ❌ |
| Country | ❌ (nincs mező) |
| Language | ❌ |
| Stage | ✅ |
| Lead priority (score) | ✅ |
| Project | ➖ Egy projekt |
| Unit / villa | 🟡 Csak a szabadszavas keresésen keresztül |
| Date range | ❌ |
| External agent | ❌ |
| **Overdue** | ❌ |
| **Next Action hiánya** | ❌ |

**Current state:** 5 szűrő (q, stage, score, form_type, owner) + rendezés 4 oszlopon +
archívum-nézet. A `q` négy mezőn keres (`name`, `email`, `phone`, `villa`).

**Problem:** a `LeadFilter.source` **már létezik és működik a store-ban**, csak az űrlapon nincs
select hozzá. Ez egy egysoros hiány, ami miatt a marketinges nem tudja megnézni a saját
kampányát a CRM-ben.

**Recommended change (sorrendben, növekvő költséggel):**
1. `source` select — a meglévő szűrőre (kb. 10 sor).
2. `flag=no-next|stalled|untouched|awaiting|overdue` — lásd 6. szekció.
3. `owner=__none__` (Unassigned).
4. `from` / `to` dátumszűrő.
5. `campaign` select.

**Priority:** Critical (1–3), Medium (4–5) · **Complexity:** Small
**Affected files:** `app/admin/(dash)/leads/page.tsx`, `lib/crm/store.ts` (`listLeads`)

**Mellékes hiba:** a CSV-export (`app/api/crm/export/route.ts:50`) **nem veszi át az `owner`
szűrőt**. Aki a „My leads" nézetből exportál, a teljes adatbázist kapja. Az export ráadásul nem
tartalmaz `owner`, `value`, `qualification` és `next task` oszlopot.
**Priority:** Medium · **Complexity:** Small · **Affected files:** `app/api/crm/export/route.ts`

---

## 15. Duplicate management — ✅ Teljesül

`store.ts:189-230` (kontakt-egyezés), `store.ts:427` (merge), `store.ts:486-566` (dedupe)

| Elvárás | Státusz |
|---|---|
| Telefonszám alapján detektálás | ✅ Az utolsó 9 számjegy alapján, min. 8 számjegynél |
| Email alapján | ✅ Kisbetűsítve, trimmelve |
| WhatsApp alapján | ✅ Ugyanazzal a kulccsal, mint a telefon |
| Duplicate esetén figyelmeztetés | ✅ **Jobb: automatikus összefűzés a beérkezésnél**, és a „Same contact" panel az adatlapon |
| Merge-elhető | ✅ Egy kattintás, megerősítéssel |
| Korábbi kommunikáció nem vész el | ✅ Jegyzet, task, history, GDPR-consent mind átmegy, **id alapján deduplikálva** (újrapróbált merge nem duplikál) |
| Lead source conflict látható | 🟡 A merge csak az üres mezőket tölti ki; **eltérő forrás esetén nem figyelmeztet** |
| Agent ownership conflict látható | ❌ (nincs agent-modul) |

**Kiemelendő megoldások:**
- A beolvadó rekord **nem törlődik, hanem archiválódik** egy „Merged into X" indoklással
  (`store.ts:478`) — a duplikátum ténye is történelem.
- Ha a duplikátum tartotta a lefoglalt villát, a villa **átkerül** a megmaradó leadre
  (`store.ts:465`), külön úton, ami megkerüli a „már foglalt" tiltást. Ez az a részlet, ami
  nélkül minden vevőnél elhasalna az összefűzés.
- A `findLeadByContact` **szándékosan az archivált leadeket is nézi** (`store.ts:207`): aki
  félretett ügyfélként újra ír, az a régi rekordján éled fel, nem mellette.
- Blocklist (`?block=1`): magánszám vagy nem-lead kontakt véglegesen kizárható.

**Problem:** összefűzésnél a forrás-attribúció ütközése némán oldódik fel — az elsődleges lead
forrása marad, a másiké elvész (csak a `merged` aktivitás sorában marad nyoma közvetve). Ha
valaha lesz bróker-jutalék, ez pénzkérdéssé válik.

**Recommended change:** a merge írjon egy aktivitás-sort, ha a két rekord `source` /
`utm_campaign` értéke eltért, a konkrét értékekkel.
**Priority:** Low (ma) / High (bróker-modullal együtt) · **Complexity:** Small
**Affected files:** `lib/crm/store.ts` (`mergeLeads`)

---

## 16. Lost leadek — 🟡 Részben

`lib/crm/types.ts:217` (`LOST_REASONS`), `components/crm/lost-reason-dialog.tsx`

| Elvárt lost reason | Van? |
|---|---|
| Too expensive | ✅ `price` |
| No response | ✅ `unreachable` |
| Bought elsewhere | ✅ `competitor` |
| Not ready | ✅ `timing` |
| Financing issue | ❌ |
| Wrong product | ❌ |
| Location | ❌ |
| Changed plans | ❌ (a `timing` részben lefedi) |
| Invalid lead | ❌ (archiválás fedi le) |
| Duplicate | ❌ (merge fedi le) |
| Other | ✅ |

| Ellenőrzés | Státusz |
|---|---|
| Lost reason kötelező | 🟡 **Az adatlapon és a kanbanon igen — bulk művelettel megkerülhető** |
| Lost date automatikusan mentődik | 🟡 A `stage` aktivitás időbélyege az idővonalon; **nincs dedikált `lost_at` mező** |
| Lost lead újranyitható | ✅ Stage-váltásnál a `lost_reason` automatikusan törlődik (`store.ts:417`) |
| Lost reason riportálható | 🟡 A `reports().lostReasons` (`store.ts:1796`) **a jegyzetek szövegét parse-olja** („Lost:" prefix), nem a `lost_reason` mezőt — és ez a riport sehol nincs megjelenítve |

**Problem 1 — a bulk művelet megkerüli a kötelező indoklást.** A lead-lista tömeges
„Move to stage… → Lost" opciója (`components/crm/leads-table.tsx:107`) közvetlenül a
`/api/crm/leads/bulk` végpontra megy, ami `lost_reason` nélkül is elfogadja a `lost` fázist
(`app/api/crm/leads/bulk/route.ts:29`). Egyetlen kattintással 200 lead veszíthető el indoklás
nélkül. Ugyanez igaz a PATCH végpontra is: a `lost_reason` opcionális.

**Recommended change:** a `Lost` opció **kikerül a bulk stage-listából** (a tömeges veszteség
amúgy sem művelet, hanem archiválás), a szerver pedig utasítsa vissza a `stage: 'lost'`
patchet `lost_reason` nélkül.
**Priority:** Critical · **Complexity:** Small
**Affected files:** `components/crm/leads-table.tsx`, `app/api/crm/leads/bulk/route.ts`,
`app/api/crm/leads/[id]/route.ts`

**Problem 2 — a lost-riport szövegparse-olásra épül.** A `lost_reason` mező strukturált és
validált, mégis a jegyzet szövegéből olvassa ki a riport a veszteség okát. Ha valaki átírja a
jegyzetet, a riport megváltozik.
**Recommended change:** a riport a `lost_reason` mezőt aggregálja, és jelenjen meg az
analitikán („Veszteség okai" bontás + Lost rate KPI).
**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/analytics.ts`, `app/admin/(dash)/analytics/page.tsx`

**Problem 3:** hiányzó okok (financing, wrong product, location). Ingatlannál a lokáció és a
finanszírozás a két leggyakoribb valódi ok.
**Priority:** Medium · **Complexity:** Small · **Affected files:** `lib/crm/types.ts`

---

## 17. Nurture leadek — ❌ Nem teljesül

| Elvárás | Státusz |
|---|---|
| Külön Nurture státusz | ❌ |
| Nurture reason megadható | ❌ |
| Következő kapcsolat időpontja | 🟡 Kézi taskkal megoldható |
| 30 / 60 / 90 / 180 napos follow-up | ❌ |
| Nurture lead automatikusan visszakerül az aktív feladatok közé | ❌ |

**Current state:** aki azt mondja, hogy „érdekel, de csak jövő tavasszal", annak két sorsa van
a rendszerben:
1. **`lost` + `timing` indok** — ezzel kikerül minden munkalistából, a digestből, a
   szekvenciából, a funnelből. Soha többé senki nem szól hozzá.
2. **`qualified`-ben marad** — ekkor 7 nap után „stalled" lesz, és **minden nap** ott ül a
   figyelmeztetések között, zajként. Az értékesítő megtanulja figyelmen kívül hagyni a
   stalled-jelzést, ami az egész riasztási rendszert leértékeli.

**Problem:** ez a **legköltségesebb hiány a rendszerben**. Egy 15–25M THB-s villánál a
6–18 hónapos érési idő normális. A „most még nem" nem veszteség, hanem időzítés — és a
rendszerben jelenleg nincs hely, ahol ezt jól lehetne rögzíteni. Mindkét jelenlegi
megoldás rossz: az egyik elveszti a leadet, a másik tönkreteszi a riasztásokat.

**Recommended change:**
- Új fázis: `nurture`, a `lost` mellett lezáró állapotként (nem aktív, tehát nem „stalled",
  nem kerül a `hasNoNextStep` alá, és leáll rajta az automata szekvencia).
- Kötelező **„mikor keressük újra"** dátum a fázisba lépéskor (30/60/90/180 nap gyorsgomb).
- A napi cron (`/api/crm/cron`) esedékessé válásakor **visszaébreszti**: teendőt hoz létre,
  a leadet visszateszi `contacted`-be, és bekerül a digest „Waiting on you" fölé egy új
  „Nurture esedékes" csoportba.

**Priority:** Critical · **Complexity:** Medium
**Affected files:** `lib/crm/types.ts` (Stage, `NURTURE_REASONS`), `lib/crm/rules.ts`,
`lib/crm/sequence.ts`, `lib/crm/store.ts`, `lib/crm/digest.ts`, `app/api/crm/cron/route.ts`,
`components/crm/lead-workspace.tsx`, `components/crm/pipeline-board.tsx`

---

## 18. Deal / opportunity — 🟡 Részben

A rendszerben az „opportunity" két helyre van szétosztva: a **lead** (`value`, `stage`) és a
**masterplan unit** (`VillaRecord` — `buyerLeadId`, `contractValue`, `phases`, `extras`,
`construction`, `promisedDate`).

| Elvárás | Státusz |
|---|---|
| Opportunity létrehozható | 🟡 Implicit — a villa-unithoz kötött vevő |
| Project kiválasztható | ➖ Egy projekt |
| Unit kiválasztható | ✅ Masterplanon, vevő-linkeléssel |
| Asking price | ✅ Listaár (`unitListPrice`) |
| Offered price | 🟡 `contractValue` — de nincs külön „ajánlott ár" |
| Discount | ❌ Nem számolt, nem tárolt (a listaár és a contractValue különbsége lenne) |
| Deal value | ✅ Két helyen: `lead.value` és `villa.contractValue` |
| Reservation amount | ✅ A 7%-os slot deposit a `PHASES`-ből |
| Payment plan | ✅ **Kiemelkedő**: 7/43/40/10 ütemterv, fizetési állapottal, összeg-felülírással, esedékességgel (`app/admin/(dash)/finance/page.tsx`) |
| Expected close date | ❌ (`promisedDate` = ígért **átadás**, nem lezárás) |
| Probability | ❌ |
| Deal stage | 🟡 = a lead stage-e |
| Deal owner | ⚠️ **Két különböző mező**: `lead.owner` és `villa.seller` |

**Problem 1 — a lead fázisa és a unit státusza nincs szinkronban.** Ha a masterplanon egy
villa `reserved` lesz és hozzálinkelik a vevőt, a **lead továbbra is `qualified`-ben marad**
(`store.ts:1370` — az `updateVillaSale` nem nyúl a leadhez). Fordítva sem: a lead `won`-ba
állítása nem adja el a villát.

Következmények:
- A funnel és a konverziós arányok (`analytics.ts` `atLeast(3)`) **nem tükrözik a valóságot**.
- Az értékesítői ranglista a `villa.seller` alapján számol, a lead-statisztikák a `lead.owner`
  alapján — **a két szám ugyanarról a személyről mást mondhat**.
- Az automata levélszekvencia csak akkor áll le, ha a lead fázisa kilép a
  `new/contacted/qualified` körből (`sequence.ts:52`). Ha egy vevő már foglalt, de a leadje
  `contacted`-ben ragadt, és soha senki nem naplózott vele beszélgetést, **a rendszer tovább
  küldi neki a „gyere és nézd meg" és „íme az árak" leveleket** egy már fizető ügyfélnek.

**Recommended change:** a villa-státusz legyen az igazság forrása a `reserved`/`won` fázisra:
az `updateVillaSale` a linkelt lead fázisát is állítsa (`reserved` → lead `reserved`;
minden phase kifizetve → lead `won`), naplózott aktivitással. Fordított irányban elég egy
figyelmeztetés: „ez a lead `won`, de nincs hozzá unit".

**Priority:** High · **Complexity:** Medium
**Affected files:** `lib/crm/store.ts` (`updateVillaSale`, `villaTxn`), `lib/crm/analytics.ts`

**Problem 2 — hiányzó előrejelzési mezők.** Nincs `expected_close_date` és nincs `probability`,
ezért **forecast nem számolható** (checklist 19. és 20. pont).
**Recommended change:** minimalista megoldás — `expected_close_date?: string` a leaden, és a
`probability` legyen **fázisból származtatott** (pl. new 5%, contacted 10%, qualified 25%,
negotiation 50%, reserved 80%, won 100%), nem kézzel karbantartott mező. A „súlyozott pipeline"
így egy sor kód, és nem termel újabb kitöltendő űrlapmezőt.
**Priority:** Medium · **Complexity:** Small
**Affected files:** `lib/crm/types.ts`, `lib/crm/rules.ts`, `lib/crm/analytics.ts`

---

## 19. Sales manager dashboard — 🟡 Részben

Két képernyő osztozik ezen: a `/admin` (WelcomeHero) és az `/admin/analytics`.

| Elvárás | Hol van? |
|---|---|
| Összes aktív lead | ✅ Analitika |
| New Leads Today | 🟡 Analitika: „Új lead · utolsó 7/30/90 nap" — **mai bontás nincs** |
| New Leads This Week | ✅ Analitika (7 napos tartomány) |
| Uncontacted Leads | ✅ Dashboard kapszula |
| Overdue Follow-ups | ✅ Dashboard kapszula + nav badge |
| Leads Without Next Action | ✅ Kapszula (de nem listázható) |
| Hot Leads | ✅ Analitika KPI |
| Qualified Leads | ✅ Analitika (fázis-bontás) |
| Meetings | ❌ |
| Negotiations | ➖ (nincs ilyen fázis) |
| Reservations | ✅ Analitika + Masterplan |
| Sales | ✅ Analitika + Payments |
| Lost Leads | 🟡 Fázis-bontásban igen, **lost rate és okok nem** |
| Pipeline value | ⚠️ **A `stats().pipelineValue` kiszámolja — sehol nem jelenik meg** |
| Forecast value | ❌ |
| Salespersononkénti teljesítmény | 🟡 Csak lezárt villa-eladás szerinti ranglista |
| Source-onkénti teljesítmény | 🟡 Csak leadszám, konverzió nélkül |
| Campaign-onkénti teljesítmény | ❌ |

**Current state:** a `/admin` főoldal egy **üdvözlőképernyő** — logó, név, HU/EN kapcsoló,
kinetikus pontmező, és alatta a figyelmeztető kapszulák. Szép, és a kapszulák valódi értéket
hordoznak, de **nem vezetői műszerfal**: nincs rajta egyetlen szám sem a pipeline-ról.

**Problem:** a vezetői információ két képernyőre és egy e-mailre van szétosztva (dashboard
kapszulák + analitika + digest), és a legfontosabb üzleti szám — **a pipeline értéke** — sehol
nem látszik, pedig ki van számolva.

**Recommended change:** a dashboard maradhat üdvözlő jellegű, de kapjon egy **négy kártyás
sort**: `Aktív pipeline értéke` · `Ebből foglalás előtt álló` · `Hó eleje óta lezárt` ·
`Figyelmet igénylő leadek`. Mind a négy már meglévő adatból.
**Priority:** High · **Complexity:** Small
**Affected files:** `app/admin/(dash)/page.tsx`, `components/crm/welcome-hero.tsx`,
`lib/crm/analytics.ts`

---

## 20. Legfontosabb KPI-k — 🟡 Részben

Az analitika jelenlegi KPI-sora: **Összes lead · Új lead (tartomány, trenddel) · Forró leadek ·
Foglalási arány**. Plusz pénzügyi blokk (elért bevétel, foglalások értéke, átlag üzletméret,
készlet-érték) és reakcióidő-blokk.

| Elvárt KPI | Státusz |
|---|---|
| New Leads | ✅ |
| Contact Rate | ❌ (számolható: `contacted+` / összes) |
| **First Response Time** | ✅ **Kiemelkedő**: automata válasz %, medián emberi reakcióidő, 1 órán belüli arány |
| Qualification Rate | 🟡 A funnelből leolvasható, nem KPI |
| Meeting / Presentation Rate | ❌ (a `TOUCHES` adat megvan hozzá, nincs aggregálva) |
| Reservation Rate | ✅ |
| Closing Rate | ⚠️ **`closeRatePct` kiszámolva (`analytics.ts:139`) — nincs kirakva a felületre** |
| Average Deal Value | ✅ (villa-alapú) |
| Sales Value | ✅ |
| Pipeline Value | ❌ Nincs megjelenítve |
| Average Sales Cycle | ❌ |
| Lost Rate | ❌ |

**Problem:** a checklist 8–12 kulcsszámot kér; az analitikán 4 KPI van felül, és **három
kiszámolt mutató (closeRate, pipelineValue, wonRate) nem jelenik meg sehol**.

**Recommended change:** a KPI-sor bővüljön 8-ra: `Új lead` · `Kontakt-arány` ·
`Medián reakcióidő` · `Kvalifikációs arány` · `Foglalási arány` · `Lezárási arány` ·
`Pipeline érték` · `Veszteség-arány`. Az átlagos üzleti ciklus (`created_at` → `won` stage
aktivitás) is kiszámolható a meglévő idővonalból.

**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/analytics.ts`, `app/admin/(dash)/analytics/page.tsx`

---

## 21. Conversion funnel — 🟡 Részben

`analytics.ts:255`, `components/crm/charts.tsx:179`

| Elvárás | Státusz |
|---|---|
| Darabszám minden szinten | ✅ |
| Conversion % | ✅ Lépésenkénti % az előző szintből, tooltipben is |
| Időszakra szűrhető | ✅ 7 / 30 / 90 / összes |
| Source-ra szűrhető | ❌ |
| Campaignre szűrhető | ❌ |
| Salespersonra szűrhető | ❌ |
| Projectre szűrhető | ➖ |

**Current state:** a funnel monoton (minden szint az előző részhalmaza), tehát a konverzió
soha nem lehet 100% fölött — ez a helyes megvalósítás, és a kód kommentje meg is indokolja.
A lépések: Lead → Kapcsolatba lépett → Kvalifikált → Foglalás → Eladás.

**Problem:** a funnel csak időszakra szűrhető. Márpedig a funnel **akkor ér valamit, ha
összehasonlít**: „a Meta-leadek 4%-a jut foglalásig, a referral-oké 22%" — ez a mondat az,
amiért a funnel létezik, és ez a mondat jelenleg nem megfogalmazható a rendszerben.

**Recommended change:** source / campaign / owner szűrő az analitika-oldal fejlécébe, ami az
egész oldalra hat (nem csak a funnelre). Az `analytics()` már mindent egy menetben számol, tehát
elég a bemeneti `leads` tömböt megszűrni.

**Priority:** High · **Complexity:** Small
**Affected files:** `lib/crm/analytics.ts`, `app/admin/(dash)/analytics/page.tsx`

---

## 22. Sales person performance — ❌ Nem teljesül

| Elvárás | Státusz |
|---|---|
| Hány leadet kapott | ❌ |
| Hány új leadet kontaktált | ❌ |
| Átlagos response time | 🟡 Csak összesítve, nem személyenként |
| Hány leadet qualificationált | ❌ |
| Hány meetinget csinált | ❌ (az adat megvan: `Activity.kind='meeting'` + `by`) |
| Hány reservation lett | ❌ |
| Hány sale lett | ✅ Ranglista (`analytics.agents`) |
| Mekkora értéket értékesített | ✅ Ranglista |
| Conversion rate | ❌ |
| Hány overdue leadje van | ❌ |
| Hány leadje van Next Action nélkül | ❌ |

**Current state:** egyetlen ranglista létezik, ami a **`villa.seller`** mezőn alapul, és csak a
lezárt eladásokat számolja (`analytics.ts:214`). A `lead.owner` alapú teljesítmény sehol nem
jelenik meg.

**Problem:** minden szükséges adat megvan — `lead.owner`, `Activity.by`, `first_response_at`,
`Task.done` —, csak nincs aggregálva. Emiatt a vezető nem tudja megválaszolni a checklist
30. pontjának két kérdését: *„Ki teljesít jól?"* és *„Kinél vannak elmaradt leadek?"*.

**Recommended change:** egy **értékesítői táblázat** az analitika alján, ownerenként egy sorral:
`kapott lead · kontaktált % · medián reakcióidő · kvalifikált · foglalás · eladás · érték ·
lejárt teendő · next action nélkül`. Egyetlen pass a `leads` tömbön, ami már be van töltve.

**Priority:** High · **Complexity:** Medium
**Affected files:** `lib/crm/analytics.ts`, `app/admin/(dash)/analytics/page.tsx`

---

# Longevity CRM — Kezelői kézikönyv

Ez a kézikönyv az admin felület (`/admin`) napi használatát írja le. Minden, ami itt szerepel, a rendszer tényleges működése — nem terv, nem ígéret.

---

## 1. Belépés

- Cím: `/admin/login`
- Felhasználónév + jelszó. A munkamenet 30 napig érvényes (cookie), utána újra be kell lépni.
- Kétféle fiók létezik:
  - **admin** — mindent láthat és módosíthat,
  - **viewer** (megfigyelő) — mindent lát, de semmit nem módosíthat. A bal oldalsáv alján „👁 View only" jelvény mutatja, és minden módosító gomb inaktív. Vendégnek, befektetőnek, auditornak való.
- Kilépés: a bal oldalsáv alján a Logout gomb.

A felület minden oldala kb. 6 másodpercenként magától frissül — nem kell F5-öt nyomni, a jelvények és a listák mindig az aktuális állapotot mutatják.

---

## 2. Dashboard — a nap kezdete

A `/admin` nyitóoldal: logó, üdvözlés a bejelentkezett névvel, HU/EN nyelvváltó (a választás megmarad), és gyorslinkek (Leadek · Analitika · Masterplan).

A lényeg az üdvözlés alatti **figyelmeztető kapszulák**. Csak akkor jelennek meg, ha tényleg van teendő — ha üres a sor, minden rendben:

| Kapszula | Jelentése | Hová visz |
|---|---|---|
| ⚠ lejárt teendő | nyitott teendő, aminek a határideje elmúlt | Follow-ups |
| érintetlen új lead | „New" fázisú lead, ami 1 napnál régebbi, és még se jegyzet, se teendő nincs rajta | Leads |
| elakadt lead | a fázisában a megengedettnél régebb óta ül (lásd 11. fejezet) | Leads |
| következő lépés nélkül | aktív lead, amin nincs nyitott teendő és nem fut válasz-időzítő sem | Leads |
| válaszra vár | 3+ napja nem jött válasz a kiküldött e-mailre | Leads |

**Ez a reggeli munkalistád.** A bal oldali menüben ugyanez piros jelvényként is látszik minden oldalon: a Leads mellett az érintett leadek száma, a Follow-ups mellett a lejárt teendők száma.

A menü tetején gyorskereső van — beírod a nevet/e-mailt/telefont, és a Leads listára visz szűrve.

---

## 3. Leads — a lista

`/admin/leads` — minden lead egy táblázatban, a legfrissebb elöl.

**Szűrés** (a lista feletti sáv):
- szabadszavas keresés (név, e-mail, telefon, villa),
- fázis (New / Contacted / Qualified / Reserved / Won / Lost),
- hőfok (Hot / Warm / Cold),
- űrlaptípus (enquiry / reserve / brochure request / manual).

**Rendezés**: a Name, Score, Stage, Received oszlopfejlécekre kattintva. Alapértelmezés: beérkezés szerint, legújabb elöl. A rendezés megtartja az aktív szűrőket.

**Jelzések a sorokban** (a Received oszlopban):
- `· stalled Xd` — a lead X napja ül a jelenlegi fázisában, a küszöbön túl,
- `· no next step` — aktív lead, aminek senki nem gazdája: se nyitott teendő, se válasz-időzítő.

Mindkettő azt jelenti: nyisd meg, és csinálj vele valamit.

**Tömeges műveletek**: pipáld ki a sorokat (vagy a fejlécben mindet), majd a lista feletti sávban:
- *Move to stage…* — a kijelöltek átrakása egy fázisba,
- *Set score…* — hőfok beállítása,
- *Delete* — végleges törlés (megerősítéssel).

Ha egy-egy elem nem sikerül, a rendszer megmondja, hányat nem tudott frissíteni, és a lista a valós állapotot mutatja.

**⧉ Tidy duplicates**: egy kattintással megkeresi azokat a kontaktokat, akiknek több leadjük van (azonos e-mail vagy telefonszám alapján, láncolva is). Először csak jelentést mutat — hány érintett kontakt, hány felesleges lead, példanevekkel — és csak megerősítés után von össze. Az összevonás mindig a kontakt **legrégebbi** leadjébe történik (az eredeti megkeresés őrzi az attribúciót); jegyzet, teendő, előzmény nem vész el.

**Export CSV**: pontosan az éppen szűrt listát tölti le CSV-ben (név, elérhetőségek, űrlap, villa, fázis, hőfok, forrás, GDPR, beérkezés, jegyzet- és nyitott teendő-szám).

**+ Add lead** (`/admin/leads/new`): kézi rögzítés — telefonos érdeklődő, walk-in, ajánlás. Legalább egy név, e-mail vagy telefonszám kell. Megadható a villa (a lista-ár placeholder-ként látszik), a forrás (phone / walk-in / referral / email / agent / other), a hőfok (alapból warm), az üzletérték és egy első jegyzet. Mentés után egyből a lead oldalára visz.

---

## 4. A lead oldala

A listából egy sorra kattintva nyílik. Két oszlop:

### Bal oldal

**Contact** — név, e-mail, telefon, WhatsApp, megkeresés típusa, beérkezés ideje, GDPR-hozzájárulás. Az **Edit** gombbal mind az öt kontaktmező (név, e-mail, telefon, WhatsApp, villa) szerkeszthető; minden módosítás bekerül az előzményekbe.

Alatta gyorsgombok: **✉ Email** (levelezőt nyit), **WhatsApp** (wa.me link), **Call** (tárcsázás).

**Sablonok**: legördülőből választasz, majd *Draft email* vagy *Draft WhatsApp* — a levelező/WhatsApp előre kitöltve nyílik meg, a lead nevével és villájával személyre szabva. **Semmi nem megy ki magától** — te nézed át és te küldöd el. A négy sablon:

| Sablon | Mikor |
|---|---|
| First response | első reakció az érdeklődésre |
| Brochure follow-up | brossúra-letöltés után |
| Viewing invite | személyes vagy videós bejárás felajánlása |
| Reservation steps | foglalási szándéknál a következő lépések |

**Same contact** — ha ugyanennek az embernek (azonos e-mail vagy telefonszám) más leadje is van, itt látszik. A **Merge in** gomb áthozza a másik lead jegyzeteit, teendőit és előzményeit ebbe a leadbe, majd törli a duplikátumot. Az elsődleges leaden semmi nem íródik felül — csak az üres mezők töltődnek ki, a GDPR-hozzájárulás pedig soha nem vész el.

**Attribution** — forrás, medium, kampány, kulcsszó, landing oldal (UTM-adatokból).

**Notes & activity** — egyetlen idővonal: a kézi jegyzeteid és az automatikus bejegyzések (lead érkezett, fázisváltás, hőfokváltás, kontakt módosítva, érték beállítva, e-mail ment ki, üzenet jött be, összevonás) együtt, legfrissebb elöl. Ide írd a hívások összefoglalóját — ami nincs leírva, az nem történt meg.

**Offer gomb.** A kapcsolat-gombok mellett. Megnyit egy kész ajánlatot a lead adataiból:
a neve, a kiválasztott rezidencia, az ár, és a 7 / 43 / 40 / 10 ütemterv kiszámolva.
Jobb felül a *Print or save as PDF* gombbal PDF-be mented. Az idővonalra rákerül, hogy
ajánlat készült és milyen összegre — ezt hetekkel később mindig megkérdezi valaki.

A foglalási és üzemeltetési **szerződés** ettől külön él, azok jogi dokumentumok. Ha
feltöltöd a sablonjaikat, ugyanezekből az adatokból ki tudjuk tölteni azokat is.

### Jobb oldal

**Status** — fázis és hőfok legördülőből, plusz az **üzletérték (THB)**. Az érték a villaválasztásból magától kitöltődik a lista-árral, de bármikor átírható.

**Owner — kié a lead.** Minden lead a beérkezés pillanatában kap gazdát, és **az ő nevével, telefonszámával megy ki minden automata levél** — az ügyfél nem „a csapattól", hanem egy embertől kap választ. Egy értékesítő esetén ez mindig te vagy. Ha többen lesztek, a rendszer körbeosztja az új leadeket: mindig az kapja, akinél éppen a **legkevesebb nyitott** lead van (a lezárt üzletek nem számítanak terhelésnek), és a legördülőből bármikor átadható másnak.

**Response tracking — a 3 napos szabály.** Ez a rendszer szíve:

1. Kiküldtél egy e-mailt vagy ajánlatot? Kattints: **„✉ Email sent — awaiting reply"**. Elindul az időzítő, és a rendszer magától létrehoz egy teendőt („Follow up — no reply yet") 3 nappal későbbre.
2. A panel mutatja, hány napja vársz. **3 nap után** a lead piros jelzést kap — és ha vevőként hozzá van kötve egy telekhez a Masterplanon, a telek is.
3. **5 nap után** a panel már azt javasolja: válts csatornát — hívd fel vagy írj WhatsAppon.
4. Ha az ügyfél válaszolt, kattints: **„Reply received"**. Az időzítő törlődik, a követő teendő magától kipipálódik. (Ha a válasz a rendszeren keresztül érkezik be — pl. WhatsApp-integráción —, ez automatikusan is megtörténik.)

**Automatic sequence — hol tart az automata levelezés.** Ez a doboz mutatja, hány levél ment ki ehhez a leadhez a hatból, mi a következő és mikor esedékes — alatta felsorolva a már kiment levelek tárgya és időpontja. Ha a szekvencia leállt, itt az okát is látod („az ügyfél válaszolt", „leiratkozott", „az üzlet továbblépett"). **Sosem érhet meglepetés**: pontosan azt látod itt, amit a rendszer tenni fog.

**Qualification** — nyolc mező arról, amit a beszélgetésből megtudtál. Az első négy azt dönti el, **vevő-e egyáltalán**: költségkeret (a saját pénznemében), időtáv, cél, és hogy készpénzből vagy hitelből. A másik négy azt, **hogyan kell neki eladni**: egyedül dönt-e, járt-e Samuin, mi hajtja, és mi az akadály.

Minden mező **azonnal mentődik**, amint átállítod. Nincs Mentés gomb, mert az olyan űrlap, amit félig kitöltenek és otthagynak.

A kártya fejlécében ott van, **mi hiányzik még**. Ez ugyanaz a lista, amit a fázis-szabályok is nézni fognak, tehát előre látod, mi kell a Qualified fázishoz.

A „Not known yet" is válasz, és **be is írhatod**: attól még hiányzónak számít, de rögzíti, hogy megkérdezted.

**Log** — a jegyzetmező alatt hat gomb: **Spoke by phone**, **No answer**, **Video call**, **Meeting**, **Site visit**, **WhatsApp**. Írj a mezőbe amit akarsz, aztán nyomd meg a megfelelőt: egy kattintás az egész.

A különbség fontos. Amelyik **valódi beszélgetést** jelent (telefon, videó, találkozó, helyszíni látogatás), az ugyanazt csinálja mintha az ügyfél írt volna: **leállítja az automata leveleket**, törli a válasz-időzítőt, és az új leadet Contacted fázisba lépteti. Aki nem vette fel, vagy akinek te írtál WhatsAppon, annál **semmi nem történik** ezekből, csak rögzül a próbálkozás. Ez azért kell, hogy a „még senki nem próbálta" és a „kétszer is hívtam, nem vette fel" ne ugyanaz legyen.

Ezt használd jegyzet helyett, amikor telefonáltál. Így a rendszer tudni fog róla, nem csak te.

**Follow-up tasks** — teendők ehhez a leadhez, opcionális határidővel. A lejárt teendő pirosan jelölve (`· overdue`); a határidő naptári nap szerint számít, tehát a ma esedékes még nem lejárt.

**Danger zone** (csak admin):
- **Archive lead** — a lead kikerül minden listából, számból, riportból, és leállnak rajta az automata levelek. **Semmi nem veszik el:** az idővonal, a jegyzetek, a forrás és a gazda-előzmény mind megmarad, és bármikor visszahozható. Ez az, amit a régi „törlés" helyett használj.
- **Archive & block contact** — ugyanez, plusz a kontakt tiltólistára kerül. Ezután az erről a számról vagy címről WhatsAppon beérkező megkeresés soha többé nem hoz létre leadet. Magánszámokra, nem valódi érdeklődőkre való.
- **Az archivált leadek** a Leads oldal jobb felső **Archive** gombjával érhetők el. Ott megnyitva egy **Restore** gomb hozza vissza.
- **Nem archiválható** az a lead, aki egy foglalt vagy eladott villa vevője. A rendszer megmondja melyiké. Előbb a masterplanon le kell választani róla, vagy a villát felszabadítani. Enélkül a villa egy olyan vevőre mutatna, akit senki nem lát.
- **Delete permanently** — csak archivált leaden jelenik meg, és **véglegesen megszünteti** az idővonalat, a jegyzeteket és a forrás-adatot. Nincs visszaút, az éjszakai mentésen kívül nincs másolat. Kizárólag valódi törlési kérésre (GDPR) használd.

### Lost — elveszett üzlet

Akár a lead oldalán, akár a Pipeline-on teszed Lost-ra, egy párbeszédablak **kötelezően** okot kér:

| Ok | |
|---|---|
| Price | ár miatt |
| Timing — not now | most nem aktuális |
| Bought elsewhere | máshol vásárolt |
| Went silent / unreachable | elhallgatott, elérhetetlen |
| Other | egyéb |

Opcionális szöveges részlet is megadható — ez „Lost: …" jegyzetként kerül az idővonalra, és a riportokat táplálja. **Elveszett üzlet ok nélkül = elpazarolt tanulság.**

Ha egy Lost lead később újra ír, a rendszer magától visszaemeli New-ba („re-engaged"), és törli az okot — a második esély nem előzmény.

---

## 5. Pipeline — a tábla

`/admin/pipeline` — hat oszlop: **New → Contacted → Qualified → Reserved → Won → Lost**.

- Kártyát **húzd át** egyik oszlopból a másikba, vagy használd a kártya alján a **‹ ›** gombokat.
- Kártyára kattintva a lead oldala nyílik.
- Minden oszlop fejléce mutatja a darabszámot és külön a hot leadek számát.
- Lost oszlopba húzáskor jön az ok-választó ablak — megerősítés nélkül a kártya nem mozdul.
- Ha a mentés nem sikerül (pl. nincs net), a kártya visszaugrik a helyére, és a rendszer szól.

---

## 6. Masterplan — a telek-fiók

`/admin/masterplan` — mind a 69 rezidencia a helyszínrajzon, színes pöttyökkel:

| Szín | Státusz |
|---|---|
| zöld | Szabad |
| sárga | Foglalt |
| piros | Eladott |

Rávisszed az egeret: gyorsinfó (azonosító, státusz, vevő, befizetett összeg). **Narancssárga pötty a jelölő sarkán** = a telekhez kötött vevő 3+ napja nem válaszol — ez a telek üldözést kér.

Egy pöttyre kattintva jobbról kinyílik a **telek-fiók**:

**Státusz** — Szabad / Foglalt / Eladott gombok. Foglaltnál és eladottnál **kötelező megadni, ki adta el / foglalta le** — ebből épül az értékesítői ranglista az Analitikában. Opcionális megjegyzés, majd „Státusz mentése". (Szabadra visszaállítás = az üzlet meghiúsult: a vevő- és fizetési adatok törlődnek a rekordról, de az előzményekben minden megmarad.)

**Vevő és szerződés**:
- **Vevő (CRM lead)** — legördülőből hozzákötöd a CRM-leadet; utána „→ Lead megnyitása" linkkel egy kattintás a lead oldala. A hozzákötés a szerződéses értéket is kitölti a lead értékéből vagy a lista-árból, ha még üres.
- **Szerződéses érték (THB)** — **dupla kattintással** (vagy a ✎ ikonnal) szerkeszthető. Amíg nincs beírva, a méret szerinti lista-ár látszik halványan („lista-ár, eladáskor magától rögzül") — az első foglaláskor/fizetéskor automatikusan ez rögzül, nem kell gépelni.
- **Ígért átadás** — dátum.
- **Építkezés állása** — Not started / Foundation / Structure up / Furnishing / Completed. Minden váltás előzménybe kerül.

**Fizetési ütem — 7 / 43 / 40 / 10** a szerződéses értékből:

| Fázis | % | Feltétel |
|---|---|---|
| Slot deposit | 7% | a telek a vevő nevére kerül |
| Foundation | 43% | alapozás kész |
| Building | 40% | épület kész |
| Furnishing | 10% | berendezés kész |

Pipálod a beérkezett fizetést, az összegek maguktól számolódnak (a fizetés dátuma is rögzül). Sáv mutatja a befizetett/hátralévő összeget és a következő mérföldkövet. **A pénz mozgatja a státuszt**: az első fizetés a szabad telket magától Foglaltra teszi, mind a négy fázis kipipálva = Eladott.

**Extra kérések** — vevői extrák opcionális árral. Előre beírt lehetőségek: Podcast studio, Office setup, Gym corner, Sauna, Outdoor kitchen, EV charger — de bármi szabadon beírható.

**Előzmények** — a telek teljes története: státuszváltások, fizetések, vevőkötés, extrák, mikor és ki.

A státuszváltozások a háttérben a Google Sheet-tel és a 3D-modellel (3DEstate) is szinkronizálódnak — ezzel nincs teendőd.

---

## 7. Payments — mennyi pénz áll kint

`/admin/finance` — a Masterplan ugyanazokat a számokat mutatja telkenként, ez pedig
oldalra fordítva: nem azt, hogy a B12-es mivel tartozik, hanem azt, hogy **mennyi jár
nekünk, és ki van csúszásban.**

Négy szám felül: **Contracted** (szerződött érték), **Received** (befolyt), **Outstanding**
(hátralék), **Needs chasing** (amit be kellene hajtani). Alatta négy lista:

- **Overdue** — elmúlt a megbeszélt dátum. Piros, és megmondja hány napja.
- **Due now** — az építkezés elért arra a szintre, ami kiengedi a részletet, de nem fizették be.
- **Next 30 days** — megbeszélt dátum a következő 30 napban.
- **Later** — még arra a szintre sem ért az építkezés.

A logika onnan jön, ahogy az ütemterv tényleg működik: **a 43% akkor esedékes, amikor az
alap elkészül**, nem egy naptári napon. Ezért ha a Masterplanon átállítod az építkezés
állapotát „Foundation"-re, a 43% magától átkerül a *Due now* listába. Ha egy konkrét
dátumban is megállapodtatok a vevővel, azt beírhatod a részlethez, és onnantól **késhet** is.

Minden sorból link visz a vevő leadjére. Ez a nézet csak a tulajdonosi fióknak látszik.

**Needs a decision.** Ha a lap alján megjelenik egy piros doboz, az olyan eltéréseket sorol fel, amiktől a fenti számok csendben hibásak: egy villa nem létező vevőre mutat, egy foglalt villán nincs vevő megnevezve, vagy egy aktív leadért senki nem felel. Egyik sem hibaüzenet, ezért nem tűnne fel magától. A rendszer nem javítja őket automatikusan, mert mindegyik üzleti döntés.

---

## 8. Follow-ups — teendők egyben

`/admin/tasks` — az összes lead összes teendője négy csoportban:

- **Overdue** — lejárt: ezekkel kezdd,
- **Due today** — ma esedékes,
- **Upcoming** — jövőbeli vagy határidő nélküli,
- **Recently completed** — az utolsó 12 kész.

Minden sorból link visz a leadre. Pipálással kész — átkerül a Done-ba.

---

## 9. Analytics — számok

`/admin/analytics` — időablak-választó: 7 nap / 30 nap / 90 nap / Összes.

- **KPI-k**: összes lead, új lead az időszakban (trend az előző azonos időszakhoz képest), forró leadek, foglalási arány.
- **Pénzügyi áttekintés** (mindig aktuális pillanatkép): elért bevétel (eladott villák), foglalások értéke, átlag üzletméret, teljes készlet-érték; sáv az eladott/lefoglalt/szabad arányról; méretenkénti bontás (M · 7,65M / L · 8,05M / XL · 11,2M THB lista-áron).
- **Reakcióidő** — a speed-to-lead mérőszáma, négy csempén:
  - *Automata válasz*: az e-mail címmel érkező leadek hány százaléka kapott azonnali köszönő levelet. Ha ez nem 100%, vagy a levélmotor nem volt bekapcsolva a beérkezéskor, vagy hibás az e-mail cím (a csempe alatt figyelmeztetés is megjelenik).
  - *Emberi reakció (medián)*: mennyi idő telt el a beérkezéstől az **első emberi** lépésig — jegyzet, teendő, fázisváltás vagy a válasz-időzítő indítása. Az automata levél ebbe **nem** számít bele: ez azt méri, te milyen gyorsan kapcsolódtál be.
  - *1 órán belül*: az érdemi válaszok hány százaléka fért bele egy órába.
  - *Kiment automata levél*: a teljes szekvenciából hány levél ment ki az időszakban.
- **Leadek**: időbeli trend, forrás szerint, pipeline-fázisok, hőfok-megoszlás, űrlaptípus.
- **Weboldal-forgalom**: látogatók időben és forrás szerint, interakciók típusonként.
- **Konverziós tölcsér**: Lead → Kapcsolatba lépett → Kvalifikált → Foglalás → Eladás.
- **Villák**: státusz-megoszlás és blokkonkénti bontás.
- **Értékesítői ranglista**: ki hány villát adott el és mekkora bevétellel. **Csak a lezárt eladás számít — a foglalás még nem eredmény.** A név a Masterplanon megadott „Ki adta el / foglalta le?" mezőből jön; a bevételnél a tényleges szerződéses érték számít, ha van, különben a lista-ár.

---

## 10. Activity — mi történik a weboldalon

`/admin/activity` — minden látogatói interakció a weboldalon, név nélkül: látogatás, kattintás, WhatsApp-gomb, hívás-gomb, e-mail, brossúra-letöltés, űrlap-megnyitás. Fent összesítők, alatta típus szerint szűrhető napló. Arra jó, hogy lásd: mozog-e az oldal, melyik csatorna él. A leadeket nem szennyezi — ez csak jelzés.

---

## 11. Hogyan kerülnek be a leadek — és mit csinál a rendszer magától

- **Weboldal-űrlapok**: minden beküldés azonnal leadet csinál. A hőfokot a rendszer magától állítja: konkrét villára irányuló megkeresés vagy foglalási szándék = **hot**, általános érdeklődés = **warm** (befektetési/foglalási területről indítva hot), brossúra-kérés = **cold**.
- **Egy ember = egy lead**: ha ugyanaz az e-mail/telefonszám ír újra (akár WhatsAppon), az üzenet a **meglévő** leadre kerül jegyzetként — nem születik duplikátum. Az üres mezők kitöltődnek, a hőfok csak felfelé módosul. A beérkező üzenet válasznak számít (törli a válasz-időzítőt), az elveszett leadet pedig újraéleszti.
- **Riasztás**: új leadről azonnali e-mail értesítés megy az operátornak (ha a küldés be van kötve), benne link a lead oldalára; hot leadnél 🔥 a tárgyban.
- **Gazda-kiosztás**: minden új lead azonnal kap felelőst (lásd 4. fejezet, *Owner*) — nincs olyan lead, amiért senki nem felel.
- **Automata ügyfél-levelezés — a 0. perctől 2 hónapig.** Csak akkor működik, ha a küldő aktiválva van; addig semmi nem megy ki. A lead gazdájának nevével, telefonszámával és WhatsApp-linkjével aláírva:

| Mikor | Levél | Miről szól |
|---|---|---|
| **0. perc** | köszönő | személyre szabva az űrlap szerint (brossúra-kérésnél a letöltési linkkel, villára irányuló megkeresésnél a foglalás menetével) |
| 3. nap | emlékeztető | egyetlen finom rákérdezés |
| 10. nap | a történet | mit építünk valójában Samuin — ok, hogy újra foglalkozzon vele |
| 24. nap | meghívó | személyes vagy videós bejárás |
| 45. nap | feltételek | árazás és a 7 / 43 / 40 / 10 fizetési ütemterv |
| 60. nap | lezárás | elegáns búcsú — utána a rendszer magától elhallgat |

  **Négy védőkorlát:**
  1. A szekvencia **azonnal leáll**, amint az ügyfél megszólal (bármilyen csatornán), leiratkozik, vagy az üzlet Reserved / Won / Lost fázisba lép. Innentől ember viszi.
  2. **Futásonként legfeljebb egy** levél megy ki leadenként — ha az időzített feladat kimarad néhány napot, nem zúdul rá négy levél egyszerre, csak a legutolsó esedékes.
  3. **Az élesítés előtti leadeket a rendszer nem szólítja meg** — a bekapcsolás nem küld semmit a régi listára, csak az azóta érkezőket kíséri végig.
  4. Minden levél alján **leiratkozó link** van. Aki rákattint, többé nem kap automata levelet (a személyes, kézzel írt leveleidet ez nem érinti) — a lead idővonalán is megjelenik, hogy leiratkozott.

  A leveleket a naponta **07:00-kor samui idő szerint** futó időzített feladat küldi; hajnali 3-kor automata mentés fut. A kiment levelek a lead idővonalán és az *Automatic sequence* dobozban is látszanak.

- **Melyik levél melyik anyagot viszi.** Nem mindegyik ugyanazt: a 0. napon a **12 oldalas áttekintő** megy (2,6 MB, telefonon azonnal megnyílik, és egy idegen ezt fogja tényleg elolvasni), a 10. és a 45. napon a **teljes 52 oldalas brossúra**. Aki kifejezetten a brossúrát kérte, az természetesen rögtön azt kapja. Így minden lépésnek van új oka a megnyitásra.

- **Kinek melyik csatorna.** Ha van e-mail címe, levelet kap. Ha csak telefonszáma van, ugyanazt a lépést **WhatsApp üzenetként** kapja meg, rövidebb formában. Eddig az ilyen leadek semmit nem kaptak.

- **WhatsApp mindkét irányban.** A beérkező WhatsApp üzenetek is a CRM-be futnak: ismeretlen számból lead lesz, ismert számnál válasz a meglévő leadre. Ezzel megáll az automata sorozat, és átjön hozzád a levelező-fiókodba is. Eddig ez Dorina telefonján maradt.

- **Ki nyitotta meg, ki kattintott.** Minden anyag saját követett linken megy ki, és minden gomb is. A lead idővonalán látszik, hogy megnyitotta a brossúrát vagy megnyomta a „Book a call" gombot. Aki egyszer megnyit valamit, warm lesz, aki háromszor, hot. Ez a legmegbízhatóbb jel arra, hogy egy elhallgatott lead újra gondolkodik rajta.

- **Reggeli összefoglaló.** Minden nap 7-kor kapsz egy levelet arról, mi vár rád: ki vár válaszra, mi járt le, kihez nem nyúlt senki, ki nyitotta meg tegnap az anyagot. **Ha nincs teendő, nem érkezik levél** — pont ettől lesz érdemes megnyitni azokon a napokon, amikor mégis jön.

---

## 12. Ki mit lát és mit tehet

Három fiók-típus van. A tulajdonos (`admin`) mindent. Az **értékesítő** (`agent`) egész nap
dolgozik a leadeken, de nem törölhet és nem lát pénzügyet. A **néző** (`viewer`) csak olvas.

| Mit | Tulajdonos | Értékesítő | Néző |
|---|:--:|:--:|:--:|
| Minden lead, pipeline, masterplan, analytics olvasása | ✓ | ✓ | ✓ |
| Lead felvétele, jegyzet, teendő, fázis, hőfok, gazda | ✓ | ✓ | — |
| Ajánlat készítése | ✓ | ✓ | — |
| Lead törlése, összevonása | ✓ | — | — |
| Masterplan pénzügyi adatai | ✓ | — | — |
| Payments nézet | ✓ | — | — |
| CSV export | ✓ | — | — |

**Minden változtatás mellett ott a neve annak, aki csinálta**, a lead idővonalán. Aminél
nincs név, azt a rendszer csinálta magától.

Az értékesítő a saját leadjeit látja először: a Leads oldalon a **My leads** gombbal
szűkíthető, egy kattintással vissza mindenkire. Ez alapbeállítás, nem fal — egymás
helyettesítése normális.

Új fiókot a `CRM_USERS` környezeti változóban lehet felvenni, `név:jelszó:agent` alakban.
Szólj, ha kell egy, és beállítom.

---

## 13. A napi rutin

**Reggel:**
1. Nyisd meg a Dashboardot. **A piros kapszulák és a menü jelvényei = a mai munkalista.** Ha nincs kapszula, minden kézben van.
2. Sorrend: **lejárt teendők** → **érintetlen új leadek** → **3+ napja válaszra várók** (hívás vagy WhatsApp, ne harmadik e-mail) → **elakadtak** → **következő lépés nélküliek**.

**Napközben, minden kontakt után egy kattintás:**
- Kiment egy e-mail/ajánlat? → **„Email sent — awaiting reply"**. Kész — a rendszer számolja a napokat és időzíti a követést.
- Beszéltetek? → rövid **jegyzet** (mit mondott, mi a következő lépés) + **teendő** határidővel.
- Válaszolt? → **„Reply received"**.

**A vasszabály: minden aktív leadnek legyen következő lépése.** Vagy nyitott teendő, vagy futó válasz-időzítő. Ha egyik sincs, a lead „no next step" jelzést kap, és reggel újra a listádon lesz. A rendszer ezen felül fázisonként is méri az időt:

| Fázis | Maximum | Utána |
|---|---|---|
| New | 1 nap | „érintetlen" / „elakadt" jelzés |
| Contacted | 3 nap | „elakadt" jelzés |
| Qualified | 7 nap | „elakadt" jelzés |

Reserved és Won fázisban nincs időkorlát — ott már a fizetési ütem a mérce, a Masterplanon.

**A lényeg**: a rendszer mindent számon tart helyetted — de csak akkor, ha a két kattintást (válaszra vár / teendő) minden kontakt után megnyomod. Ami be van jelölve, azt a CRM soha nem felejti el; ami nincs, azt senki.

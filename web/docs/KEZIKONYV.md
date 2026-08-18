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

| Kapszula | Jelentése |
|---|---|
| ⚠ lejárt teendő | nyitott teendő, aminek a határideje elmúlt |
| érintetlen új lead | „New" fázisú lead, ami 1 napnál régebbi, és még se jegyzet, se teendő nincs rajta |
| elakadt lead | a fázisában a megengedettnél régebb óta ül (lásd 11. fejezet) |
| következő lépés nélkül | aktív lead, amin nincs nyitott teendő és nem fut válasz-időzítő sem |
| válaszra vár | 3+ napja nem jött válasz a kiküldött e-mailre |

**Minden kapszula a saját, leszűrt lead-listájára visz** — a szám és a lista mindig ugyanannyi.
Korábban a kapszula megmondta, hogy *7 lead következő lépés nélkül*, aztán a szűretlen listát
nyitotta meg, és neked kellett megkeresni, melyik az a hét.

A menü tetején gyorskereső van — beírod a nevet/e-mailt/telefont, és a Leads listára visz szűrve.

---

## 2b. Mai teendők — „kit hívjak most?"

`/admin/today` — **ezzel kezdődik a nap.** Nem műszerfal: egy sorrendbe rakott munkalista, amin
minden élő lead pontosan **egyszer** szerepel, annál az oknál, ami a legsürgősebb rajta. Aki
egyszerre érintetlen, elakadt és nincs rajta következő lépés, az egy telefon — nem három sor.

A szakaszok sorrendje kötött, mert ez a munka sorrendje is:

| # | Szakasz | Ki kerül ide |
|---|---|---|
| 1 | **Nobody has spoken to them yet** | új lead, akivel még senki nem beszélt (a kiment automata e-mail nem beszélgetés, a nem felvett hívás sem) |
| 2 | **Late** | volt rá teendő határidővel, és lejárt |
| 3 | **Due today** | mára időzített teendő |
| 4 | **Back from nurture** | félretett lead, aminek megjött a dátuma |
| 5 | **Gone quiet** | 3+ napja nincs válasz a kiküldött e-mailre |
| 6 | **No next step** | élő üzlet, amin semmi nincs betervezve |
| 7 | **Not moving** | a fázisában a megengedettnél régebb óta ül |

Szakaszon belül a **legrégebbi elöl** — aki a legrégebben vár, azt lehet a leghamarabb elveszíteni.

Alapból **a saját leadjeidet** mutatja (ha a névsorban szerepelsz). A „Whole team" gombbal a
teljes csapat látszik, a legördülővel pedig egy konkrét kolléga napja — ez a sales vezető nézete.

**A „Follow up…" legördülő** csak azoknál a soroknál jelenik meg, ahol semmi nincs betervezve.
Kiválasztod, hogy *ma / holnap / 3 nap / egy hét / két hét*, és a teendő azonnal felkerül a
leadre. Nem kell megnyitni, nem kell gépelni. Ez a leggyakoribb hiba javítása egy kattintással:
a lead, amin nincs következő lépés, csendben vész el.

A bal oldali menüben a **Today** melletti piros szám pontosan ennek a listának a hossza — ugyanaz
a szabály számolja, tehát a jelvény és az oldal soha nem mondhat mást.

---

## 3. Leads — a lista

`/admin/leads` — minden lead egy táblázatban, a legfrissebb elöl.

**Szűrés** (a lista feletti sáv):
- szabadszavas keresés (név, e-mail, telefon, villa),
- **állapot** (`Any state`) — pontosan a Mai teendők hat szabálya, egyesével kérdezve:
  akivel még senki nem beszélt · lejárt · mára időzített · elhallgatott · nincs betervezve semmi ·
  nem mozdul. Ugyanaz a szabály fut, mint a Mai teendők oldalon — csak ez a nézet rendezhető,
  tömegesen kezelhető és exportálható. A Mai teendők a munkára való, ez a vezetésre.
  A Mai teendők minden szakaszfejlécéből egy „in the list →" link ide hoz át,
- **ország** — az irányítószámból olvasva, vagy amit valaki kézzel felülírt,
- **vásárlási időtáv** — amit a qualification során rögzítettetek,
- **budget-tól** + deviza,
- fázis (New / Contacted / Qualified / Presentation / Visit / Negotiation / Reserved / Contract / Won / Lost),
- hőfok (Hot / Warm / Cold),
- űrlaptípus (enquiry / reserve / brochure request / manual).

**Rendezés**: a Name, Score, Stage, Received oszlopfejlécekre kattintva. Alapértelmezés: beérkezés szerint, legújabb elöl. A rendezés megtartja az aktív szűrőket.

**Next step oszlop** — mi a következő lépés ezen a leaden, és mikorra van időzítve. Pirosan és
`late ·` előtaggal, ha lejárt; `today ·`, ha mára szól. Ha semmi nincs betervezve, a cella azt
írja ki, hogy **Nothing planned** — szavakkal, nem üres cellával, mert az üres cella ugyanúgy néz
ki, mint egy be nem töltött adat.

**Jelzés a Received oszlopban**: `· stalled Xd` — a lead X napja ül a jelenlegi fázisában, a
küszöbön túl. Nyisd meg, és csinálj vele valamit.

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

**Contact** — név, e-mail, telefon, WhatsApp, **ország**, megkeresés típusa, beérkezés ideje, GDPR-hozzájárulás.

Az **ország** alapból a telefonszám országhívójából jön — azt senki nem hamisítja. Ha téves
(tipikusan: brit vevő dubai számról), a szerkesztésben átállítható; **legördülőből**, nem
szabad szövegként, mert az „UK", a „United Kingdom" és az „England" három külön sor lenne a
riportban. Üresre állítva visszatér a telefonszám szerinti olvasatra. Az **Edit** gombbal mind az öt kontaktmező (név, e-mail, telefon, WhatsApp, villa) szerkeszthető; minden módosítás bekerül az előzményekbe.

Alatta gyorsgombok: **✉ Email** (levelezőt nyit), **WhatsApp** (wa.me link), **Call** (tárcsázás).

Mindhárom **felkerül az idővonalra** — pontosan azzal a szöveggel, ami tényleg történt:
*„Opened WhatsApp to write to them"*, nem *„elküldve"*. A levelezőprogram megnyitása nem
elküldött üzenet, és amit nem tudunk, azt nem írjuk le. Ezért ez a bejegyzés **nem számít
kontaktnak**: nem állítja le az automata e-mail-sorozatot, és nem viszi a leadet Contactedbe.
Ha tényleg beszéltetek, azt a lenti **Log:** gombokkal rögzíted.

Ugyanezen belül 10 percen belüli ismételt kattintás egyetlen sorként jelenik meg — a kétszeri
kattintás egy szándék.

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

**Fit & engagement** — két külön mérce, szándékosan **nem** egyetlen szám.

| | Mit kérdez |
|---|---|
| **Can they buy** (fit) | keret, időtáv, mire kell, honnan a pénz, konkrét villa, ki dönt |
| **Are they talking to us** (engagement) | volt-e megtekintés, beszéltetek-e, írt-e vissza, foglalt-e hívást, megnyitotta-e amit küldtünk |

A kettő összekeverése a két legdrágább hiba egy pipeline-ban:

- akinek **megvan a pénze és az időzítése, de elhallgatott**, egyetlen kevert számban „hidegnek"
  látszik, és kiesik — pedig ő a legértékesebb név a listán;
- aki **mindenre válaszol, de a belépő villát sem tudja megvenni**, „forrónak" látszik, és elvisz
  két hetet.

A kártya alján egy mondatban ki is mondja, melyikről van szó: *„Can buy, has gone quiet — chase
this one"*, *„Talks to us, may not be able to buy — qualify properly"*, és így tovább.

**Egyik szám sincs tárolva** — mindkettő az adatokból számolódik. Ha kijavítasz egy keretet, a
pontszám a következő megnyitáskor már helyes. Nincs migráció, és nincs második másolat, ami
elcsúszhatna.

**A keret küszöbe nem egy beírt szám**: a **legolcsóbb villa lista-ára**. Aki ez alatt van, itt
nem tud venni, bármi más igaz is — és a küszöb magától mozdul, ha az árlista változik.

**Az engagement csak azt számolja, amit *ők* csináltak** (vagy amit valaki *velük*). A kiment
automata levél nem engagement, és a nem felvett hívás sem. És nem szoroz: aki kilencszer nyitotta
meg a brossúrát, érdeklődő — nem kilencszer érdeklődőbb annál, aki egyszer.

Ami **hiányzik**, azt külön kiírja („Nobody has asked: budget, timeframe") — mert az alacsony
pontszám és az *ismeretlen* pontszám két különböző dolog, és a különbség az, ami alapján
cselekedni lehet.

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

**Ha a „Timing — not now" okot választod, az ablak figyelmeztet:** ez a leggyakoribb hibás
válasz. Aki *még* nem vesz, az nem elveszett. Ilyenkor lépj ki, és a lead oldalán a **Not now**
kártyát használd helyette.

### Not now — félretett lead (nurture)

Ez a harmadik válasz a *Lost* és a *hagyjuk Qualifiedben porosodni* között. Ingatlanban a
6–18 hónapos érési idő teljesen normális: várnak egy thaiföldi utazásra, egy házeladásra, a
társ döntésére, a következő ütem elkészülésére. Mindkét másik megoldás tönkretesz valamit —
a Lost eltemeti a leadet és tele szemeteli a veszteség-riportot olyan üzletekkel, amiket soha
nem vesztettünk el; a Qualifiedben hagyás pedig minden nap „elakadt" jelzést ad, ami néhány hét
alatt megtanítja a csapatot figyelmen kívül hagyni a saját jelzéseit.

A lead oldalán, a jobb oszlopban: **Not now** kártya.

1. Válaszd ki a **dátumot**, amikor vissza akarsz térni hozzá (csak jövőbeli dátum fogadható el).
2. Válaszd ki, **mire várunk**: thaiföldi utazás · pénz · jövőre vásárol · társ döntése ·
   építkezés · egyéb.
3. **Park until then.**

Ettől kezdve a lead:
- **eltűnik a Mai teendők listájáról** és minden figyelmeztető számból,
- **nem kap automata e-mailt** (a sorozat leáll: *Parked until …*),
- **nem kap „elakadt" jelzést** — a listában és a Pipeline-on az áll rajta, hogy *Parked until …*,
- **megtartja a fázisát**: egy házeladásra váró qualified vevő továbbra is qualified vevő,
- **mindent megtart**: jegyzetek, előzmény, attribúció, gazda.

**A megadott napon magától visszajön**, a Mai teendők **Back from nurture** szakaszába, és odaírja,
mire vártunk. Hamarabb is visszahozhatod a **Back in play now** gombbal — és **bármilyen
fázisváltás automatikusan feloldja**, mert ha valaki tényleg mozgatja az üzletet, akkor egy hetekkel
korábban beállított dátum már elavult.

---

## 4b. Ügynökségek — ki hozta a vevőt

`/admin/agencies`

Eddig a bevezető ügynökség egy szabadszöveg volt a `source` mezőben. Nem volt dátuma, nem
lehetett eldönteni, ki hozta a vevőt előbb, és nem lehetett megválaszolni azt a kérdést, hogy
**melyik ügynökség hoz olyan vevőt, aki tényleg vásárol**. Ez az egyetlen adat, amit utólag nem
lehet pótolni: ha nincs rögzítve a bevezetés pillanatában, örökre elveszett.

> **Figyelem a szóhasználatra.** A CRM-ben az „agent" eddig a *saját* értékesítőnket jelentette
> (a `CRM_AGENTS` névsor, a lead „Owner"-e, az `agent` belépési szerepkör). Az itteni emberek
> egy másik cégnek dolgoznak. Az **ügynökség** a cég, az **ügynök** az ő nevesített emberük.

### Az ügynökség lapja

Alap adatok: név, ország, weboldal, hol tartunk (`In discussion` → `Active` → `Paused` →
`Agreement ended`), az együttműködési szerződés dátuma.

**Jutalék**: százalék a vételárból, vagy fix összeg eladásonként. Ha nincs megállapodás, hagyd
üresen — a riportban akkor `—` fog állni, nem `0`. A kettő nem ugyanaz: a nulla azt állítja,
hogy nem keresnek semmit.

**A jutalék-főkönyv** külön kártya az ügynökség lapján, és három számot mutat:

| | |
|---|---|
| **Generated** | amennyit a megállapodás *termel* az eladott értéken — ez **számítás** |
| **Paid** | amennyit ténylegesen kifizettünk — ez **rögzített tény**, nem becslés |
| **Outstanding** | a kettő különbsége |

Egy kifizetés rögzítése: összeg, dátum, opcionálisan hivatkozás (banki azonosító, számla) és
hogy mire megy (villa vagy üzlet).

**Törölni nem lehet.** Ha rossz összeget vittél be, **negatív tétellel** javítod — ez a
könyvelés saját válasza a problémára, és így a nyom sértetlen marad. Egy pénzügyi bejegyzés,
ami csendben eltűnhet, nem bejegyzés.

Ha nincs jutalék-megállapodás, az „Outstanding" `—`, nem `0`: egy ismeretlenből kivonva egy
ismertet nem szám jön ki.

**Védelmi ablak (protection window)**: hány napig védi az ügynökség igényét egy regisztráció.
Alapból **90 nap** (a `CRM_AGENCY_PROTECTION_DAYS` beállítás), de aki mást tárgyalt ki, annak
saját száma lehet.

**Az ő ügynökeik**: nevesített emberek. Aki elmegy, azt a **„They left"** gombbal jelölöd —
soha nem törlődik, mert egy tavalyi regisztráció az ő nevével szerepel, és annak úgy kell
maradnia.

Minden mező **kilépéskor mentődik**. Nincs Save gomb, amit el lehet felejteni megnyomni.

**Az együttműködés vége**: az „End the relationship" **archivál**, nem töröl. Az ügynökség
eltűnik minden választóból és riportból, de **a regisztrációi rajta maradnak a vevőkön** — így
egy jövőre záruló eladás is annak lesz elszámolva, aki behozta.

Az oldal alján: **minden vevő, akit ők hoztak** — dátummal, az ő ügynökük nevével, fázissal
és üzletértékkel.

### Az ügynökségek listája

A táblázat nem a leadek számáról szól. Az az ügynökség, aki negyven nézelődőt regisztrál és
semmit nem ad el, **költség**; aki hatot regisztrál és kettőt elad, az a megőrzendő kapcsolat.
Lead-számban a kettő egyformán néz ki — ezért van ott a **Sold**, a **Conversion** és a
**Sales value** oszlop is.

### Regisztráció — a lead oldalán

A vevő oldalán, a bal oszlopban: **Introduced by** kártya.

1. Válaszd ki az **ügynökséget** (és ha tudod, az **ügynököt**).
2. **Record registration.**

Ettől kezdve a leaden ott áll, ki hozta, mikor, ki rögzítette, és meddig védett az igény.
A bejegyzés **soha nem szerkeszthető és nem törölhető** — ez teszi bizonyítékká.

**Ha másik ügynökség már regisztrálta és még él az igénye**, a rendszer **elutasítja**, és
megmondja, ki tartja és meddig:

> *Bangkok Prime Property registered this buyer on 2026-03-04 and holds the claim until 2026-06-02.*

Ez nem hiba, hanem a válasz arra a vitára, ami egyébként e-mailben zajlana. Fölé **csak a
tulajdonos** rögzíthet, külön megerősítéssel — és akkor **mindkét regisztráció** ott marad, az
újon pedig szerepel, hogy melyik fölé került.

**Visszavonás** (`Withdraw`, szintén csak tulajdonos): indoklás kötelező. A regisztráció nem
tűnik el, hanem az indoklással és a dátummal együtt ott marad a lapon.

### Ki kap kreditet

Két külön kérdés, és a rendszer külön is kezeli őket:

| Kérdés | Válasz |
|---|---|
| **Regisztrálhatja-e most más?** | A legutóbbi, még élő és le nem járt igény. Ez **lejár** — egy örökké tartó igény egy emberre szóló örök igény lenne. |
| **Ki hozta a vevőt?** | Az **első**, soha vissza nem vont regisztráció. Ez **nem jár le.** Aki behozta, az hozta be, akkor is, ha az üzlet tizenhárom hónappal később zárul. |

Minden teljesítmény-szám a második szerint számol. A lejárt védelmi ablak azt jelenti, hogy más
is regisztrálhatja ugyanazt az embert — **nem** azt, hogy a történelem átíródik.

**Összevonáskor** (duplikátum) a regisztrációk átjönnek, dátum szerint sorrendbe rendezve. Két
rekord összevonása soha nem veheti el egy ügynökségtől a bevezetést.

Az **Export CSV** is viszi: `agency`, `agency_agent`, `registered` oszlopok.

---

## 5. Pipeline — a tábla

`/admin/pipeline` — **tíz oszlop**:

**New → Contacted → Qualified → Presentation → Visit → Negotiation → Reserved → Contract → Won**,
és a **Lost** mint kijárat bármelyik pontról.

Korábban hat fázis volt, és a három dolog közül, ami *valóban* történik egy üzlettel — a
prezentáció, a megtekintés, az alkudozás — egyik sem szerepelt köztük. Így a Qualified és a
Reserved közötti teljes szakasz egyetlen lépésnek látszott, és a tölcsér soha nem tudta
megmondani, **hol halnak meg** az üzletek.

Tíz, és egyetlenegy se több. Minden fázis egy oszlop a táblán és egy döntés minden
kártyamozgatásnál — egy tábla, amit senki nem tart naprakészen, rosszabb, mint egy durvább, ami
viszont igaz.

| Fázis | Mit jelent |
|---|---|
| **New** | Beérkezett. Még senki nem beszélt vele. |
| **Contacted** | Volt egy valódi beszélgetés. |
| **Qualified** | Tudjuk a keretet, az időtávot, hogy mire kell és honnan a pénz. |
| **Presentation** | Tényleg megvolt a prezentáció vagy a Zoom. |
| **Visit** | Látta — helyszínen vagy élő videós körbevezetésen. |
| **Negotiation** | Konkrét villáról, árról és feltételekről beszélünk. |
| **Reserved** | Egy villa tartva van neki. |
| **Contract** | Az adásvételi kiment, véleményezés alatt van, vagy aláírták. |
| **Won** | Eladva. |
| **Lost** | Nem ez lett. Indoklás kötelező. |

A lead oldalán a fázisválasztó alatt mindig ott áll, hogy az adott fázis **mit jelent**. Egy
fázis, amit mindenki másképp ért, olyan tölcsér, ami semmit nem mér.

### Két szabály, kétféle szigorral

**Elutasítás — a Reserved, a Contract és a Won villát követel.** Mindhárom azt állítja, hogy egy
konkrét villáról van szó. Ha nincs villa a leaden, a rendszer **nem engedi** a mozgatást, és
megmondja, miért: enélkül a masterplanon nem látszik, ki tartja a telket, az üzletérték mögött
nincs semmi, és senki nem veszi észre, amíg valaki el nem akarja adni ugyanazt a villát
másodszor is. Tömeges mozgatásnál **név szerint** kiírja, melyik leadet nem engedte és miért.

**Rögzítés, nem tiltás — minden más.** Qualified-be (vagy azon túlra) hiányzó válaszokkal is
mozgathatsz. A rendszer előbb rákérdez, aztán **ráírja a hiányt magára a fázisváltásra**:

> *New → Presentation — still unknown: budget, timeframe, purpose*

Ugyanabban a sorban az állítás és a bizonyíték. Egy CRM, ami vitatkozik az értékesítővel arról,
mit derített ki egy beszélgetésen, olyan CRM, amit abbahagynak vezetni — és akkor semmit nem tud.

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

**Fizetési ütem** a szerződéses értékből. A cím a villára tényleg érvényes ütemet írja ki, nem
egy beégetett szöveget:

| Fázis | % | Feltétel |
|---|---|---|
| Slot deposit | 7% | a telek a vevő nevére kerül |
| Foundation | 43% | alapozás kész |
| Building | 40% | épület kész |
| Furnishing | 10% | berendezés kész |

Pipálod a beérkezett fizetést, az összegek maguktól számolódnak (a fizetés dátuma is rögzül). Sáv mutatja a befizetett/hátralévő összeget és a következő mérföldkövet. **A pénz mozgatja a státuszt**: az első fizetés a szabad telket magától Foglaltra teszi, és ha **az adott villa ütemének minden lépése** ki van pipálva, az Eladott.

**Egyedi ütem.** A 7 / 43 / 40 / 10 a ház alapértelmezése, nem természeti törvény. Ha egy vevő
mást alkudott ki, a százalékok a villa lapján átírhatók (összegük pontosan 100 kell legyen), és
**az a villa attól kezdve a saját feltételein fut**. A „Vissza az alapértelmezéshez" gombbal
visszaállítható.

Két dolgot a rendszer **nem enged**:
- **már befizetett részlet mellett** nem módosítható az ütem — az felülírná, mennyi érkezett be;
- olyan felosztást nem fogad el, ami nem ad ki 100%-ot.

**Ami a legfontosabb**: a villa azt az ütemet őrzi meg, *amin eladtátok*. Ha a projekt jövőre
más feltételekkel árul, az **nem írja át** a már megkötött üzleteket.

**Extra kérések** — vevői extrák opcionális árral. Előre beírt lehetőségek: Podcast studio, Office setup, Gym corner, Sauna, Outdoor kitchen, EV charger — de bármi szabadon beírható.

**Előzmények** — a telek teljes története: státuszváltások, fizetések, vevőkötés, extrák, mikor és ki.

A státuszváltozások a háttérben a Google Sheet-tel és a 3D-modellel (3DEstate) is szinkronizálódnak — ezzel nincs teendőd.

---

### Foglalás — a villa lapján

Eddig a „foglalt" státusz annyit mondott, hogy a villa tartva van. Azt nem, hogy **meddig**,
**mekkora előlegre**, és hogy az **előleg megérkezett-e** — pedig a foglalási szerződés pontosan
ebből a négy adatból áll. Enélkül egy lejárt foglalás pontosan úgy nézett ki, mint egy élő, és
úgy derült ki, hogy valaki el akarta adni a villát valaki másnak.

A masterplanon a villa lapján, a **Foglalás** blokkban:

1. **Előbb kösd hozzá a vevőt.** A rendszer **nem enged** foglalást névtelen villára — egy
   foglalás, aminek nincs neve, nem foglalás.
2. Add meg az **előleget** és hogy **meddig tartjuk**.
3. **Foglalás rögzítése.**

Utána a lapon szerkeszthető, hogy az **előleg mikor érkezett be** (ez külön tény attól, hogy
megállapodtatok róla), meddig él a foglalás, és hol van a **foglalási szerződés** (fájlnév vagy
link — a CRM nem dokumentumtár, és nem is tesz úgy, mintha az lenne).

Ha a dátum lejárt, a lap pirosan szól. A **Foglalás elengedése** gomb indoklást kér: a villa
visszakerül a piacra, a foglalás lekerül a lapról, de **az egész bekerül a villa előzményeibe** —
ez az, amit fél év múlva keresni fogsz, amikor a vevő visszajön, hogy neki ígértétek.

### Adásvételi szerződés (SPA)

A foglalás és az eladás között eddig **semmi nem volt**: egy üzlet három hónapig „foglalt" volt
akkor is, ha a szerződés aznap reggel ment ki, és akkor is, ha alá volt írva egy fiókban.

Négy állapot — *Nincs elkezdve → Kiküldve → Véleményezés alatt → Aláírva* —, és mindegyik
**rögzíti a saját dátumát az első alkalommal**. Ha visszalépsz egy elgépelés miatt, az nem írja
felül, hogy mikor ment ki tényleg a szerződés.

---

## 7. Payments — mennyi pénz áll kint

**Reservations running out** — ha van lejárt vagy héten belül lejáró foglalás, az oldal tetején
piros dobozban felsorolja: melyik villa, kinek, megjött-e az előleg, és hány napja járt le (a
„9 nappal ezelőtt" szándékosan negatív napokból számolódik — nullára kerekítve eltűnne, milyen
rossz a helyzet).

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

## 8b. Performance — a sales vezető képernyője

`/admin/performance`

Nem az Analitika másolata. Az a weboldal forgalmáról és a készlet értékéről szól; **ez négy
kérdésre válaszol az értékesítésről magáról**: hol halnak meg az üzletek, mennyi ideig tartanak,
ki termel, és mi kíván ma vezetői döntést.

Ennek a nagy része eddig is kiszámolódott — és eldobódott. A rendszer forrásonként kiszámolta a
nyerési arányt és a bevételt **minden egyes lekéréskor**, és egyetlen oldal sem jelenítette meg.

### Needs management attention

Négy szám, mindegyik **kattintható**, és a saját leszűrt lead-listájára visz: akivel még senki
nem beszélt · lejárt követés · nincs betervezve semmi · nem mozdul.

### The shape of the business

Eladott érték · pipeline érték (qualified és még nyitott) · **értékesítési ciklus** (medián:
beérkezéstől eladásig) · **első kontaktus ideje** (medián: beérkezéstől az *első valódi
beszélgetésig* — a kiment automata levél és a nem felvett hívás egyik sem az).

### A tölcsér — hol halnak meg az üzletek

| Oszlop | Mit mond |
|---|---|
| **Reached** | hányan **jutottak el** eddig a fázisig (nem az, hogy most hányan ülnek benne) |
| **Of all leads** | az összes leadhez képest |
| **From previous** | **ez az egyetlen oszlop, ami miatt érdemes értekezletet tartani** |
| **Lost here** | hányat vesztettünk el pontosan ebben a fázisban |

A „41 lead eljutott a prezentációig" egy adat. Az, hogy „a prezentációt kapott leadek
háromnegyede soha nem jutott el megtekintésig", egy **döntés**. 50% alatti átmenet pirosan.

Az elvesztett üzletek is beleszámítanak azokba a fázisokba, amiken **áthaladtak** — különben úgy
tűnne, mintha elpárologtak volna, ahelyett hogy egy konkrét ponton elvesztek volna.

A rendszer megmondja, ha nem tud mindent: *„a 12 elvesztett üzletből 5 még azelőtt veszett el,
hogy a CRM rögzítette volna, melyik fázisban" —* a „Lost here" oszlop pontosan ennyivel kevesebb.
Nem tippel, hanem kimondja.

### By salesperson

Lead-szám, nyitott, pipeline-érték, eladás, eladási érték, konverzió, és **hány élő leadje
kíván most figyelmet**. A gazdátlan leadek **külön sorban** szerepelnek (`— unassigned —`) —
az a legfontosabb sor a képernyőn, nem kerekítési hiba.

### By country

Honnan jönnek a vevők. Nemzetközi fejlesztésnél ez az egyik legerősebb szegmentáció: mást jelent
a fizetési szokás, a jogi struktúra, hogy melyik szezonban jönnek ki, és hogy egyáltalán
felülnek-e repülőre. Eddig ez **kiszámolódott minden lead lapján, és eldobódott**.

Akit nem tudunk elhelyezni (nincs telefonszám, nincs rögzített ország), az **kimarad** a
táblázatból — nem „ismeretlen ország" sorba kerül. Egy sor olyan leadekből, akikről semmit nem
tudunk, senkinek nem mond semmit.

### Budget szerinti szűrés — és miért nem hazudik

A budget abban a devizában van tárolva, **amit a vevő mondott**. Ez helyes a nyilvántartásnak és
kényelmetlen az összehasonlításnak.

Ha nincs beállítva árfolyam (`CRM_FX`), a szűrő **csak a kiválasztott devizában rögzített**
budgeteket hasonlítja össze, és az oldal ezt ki is írja. Nem talál ki árfolyamot: egy kitalált
árfolyam olyan szűrőt csinálna, ami teljesnek látszik, miközben csendben elrejt vevőket. Ha van
beállítva árfolyam, átvált, és azt írja ki, hogy **közelítő**.

### By source · By campaign · By ad

Csatornánként: lead → qualified → foglalás → eladva → érték. **A lead-szám önmagában semmit nem
jelent**: az a forrás, amelyik negyven olcsó leadet hoz és egy vevőt sem, drágább, mint amelyik
négyet hoz. Ahol még semmi nem dőlt el, ott `—` áll nyerési arány helyett, nem `0%` — az utóbbi
rágalom lenne egy fiatal kampánnyal szemben.

**A csatorna nem az írásmód.** Eddig az `fb`, a `Facebook`, az `FB_ads` és az `l.facebook.com`
négy külön sor volt egy nyolcsoros listában — vagyis a szétszórt írásmód nem csak csúnya volt,
hanem **elrejtette** annak a csatornának a teljesítményét, amelyik a legtöbbet hozta. Most
egyetlen **Facebook** sor. A nyers értékek nem vesznek el: a sor alatt ott van, mi volt tényleg
a linkben, és az „Other" sor is kiírja, mi van benne — egy „Other: 14", ami nem árulja el, mit
tartalmaz, pontosan így tüntet el egy valódi csatornát.

A leadek szűrésénél is ez fut: a **Facebook** kiválasztása minden írásmódot elkap.

**By campaign / By ad**: a csatorna azt mondja meg, hogy a Facebook működik; a kampány azt, hogy
**melyik** Facebook; a hirdetés azt, hogy melyik kreatív. Mindkét adat eddig is ott volt minden
leaden (`utm_campaign`, `utm_content`), csak soha semmi nem csoportosított rá.

Ezek a táblázatok **csak akkor jelennek meg, ha a linkek tényleg hordozzák a címkéket**. A
címkézetlen forgalom **kimarad** belőlük — nem egy rosszul teljesítő kampány, hanem meg nem
jelölt forgalom, és a kettő összekeverése az, amitől egy riport hazudni kezd.

### Why we lose · By agency

A veszteség-okok a **strukturált mezőből** jönnek, nem a jegyzet szövegéből.

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

**Hat fiók-típus** van:

| Szerep | Mi ez |
|---|---|
| **Tulajdonos** (`admin`) | Minden, a visszafordíthatatlant is beleértve. |
| **Sales vezető** (`head`) | Úgy dolgozik a leadeken, mint az értékesítő, **és**: átoszthat, összevonhat, archiválhat, exportálhat, és látja a pénzt. A jutalék-megállapodásokat nem. |
| **Értékesítő** (`agent`) | Egész nap dolgozik a leadeken. Nem törölhet, nem veheti el más leadjét, nem nyúlhat a főkönyvhöz, nem exportálhat. |
| **Pénzügy** (`finance`) | A főkönyv és semmi más: fizetések, foglalások, szerződések, ütemek. Leadeken nem dolgozik. |
| **Marketing** (`marketing`) | Attribúció és kampányok — **szándékosan pénzügyi adatok nélkül**. |
| **Néző** (`viewer`) | Mindent olvas, semmit nem változtat: vendég, befektető, könyvvizsgáló. |

Minden lead, a pipeline, a masterplan és az analitika **olvasásához** semmilyen külön jog nem
kell — aki be van jelentkezve, látja.

| Jogosultság | admin | head | agent | finance | marketing | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Jegyzet, teendő, fázis, qualification, kontakt-napló, ügynök-regisztráció | ✓ | ✓ | ✓ | — | — | — |
| Lead átosztása másvalakitől | ✓ | ✓ | — | — | — | — |
| Összevonás, duplikátum-takarítás | ✓ | ✓ | — | — | — | — |
| Archiválás | ✓ | ✓ | — | — | — | — |
| Végleges törlés | ✓ | — | — | — | — | — |
| CSV export | ✓ | ✓ | — | — | — | — |
| Pénzügyi adatok **olvasása** | ✓ | ✓ | — | ✓ | — | ✓ |
| Masterplan főkönyv **írása** | ✓ | — | — | ✓ | — | — |
| Ügynökségek, jutalék-feltételek, igény felülírása | ✓ | — | — | — | — | — |

**Három megkülönböztetés, ami nem véletlen:**

- **Az archiválás nem törlés.** Félretenni egy leadet visszafordítható, és arra tartozik, aki a
  csapatot viszi. Az előzményét megsemmisíteni nem visszafordítható, és a tulajdonosnál marad.
- **Felvenni egy leadet nem ugyanaz, mint elvenni.** Gazdátlan leadet az értékesítő is
  magához vehet — az beugrás, és tiltani annyit tenne, hogy a lead ott marad senkinél. Amelyik
  már **valakié**, azt csak a sales vezető mozgathatja: a gazda-választó ilyenkor **le van
  tiltva**, nem mentéskor utasít el. Senki ne úgy tudja meg a szabályt, hogy visszadobják.
- **A néző látja a pénzt, a marketing nem.** A nézőt befektetőnek és könyvvizsgálónak adjuk, és
  eddig is olvasta a masterplan főkönyvét. A marketing az egyetlen szerep, ami elől a számok el
  vannak rejtve: *hány vevőt hozott egy kampány*, az az ő dolguk; *mennyit érnek ezek a vevők*,
  az nem.

A bal alsó sarokban mindig ott a **szerep-címke** — a tulajdonosnál nincs, mert nála minden ott
van, nincs mit megmagyarázni. Marketing fióknál a **Payments** menüpont meg sem jelenik: egy
menüpont, ami mindig azt mondja, hogy „ez nem neked való", elromlott CRM-nek látszik.

**A gomb elrejtése nem védelem** — mindegyik fenti sort maga az API is elutasítja, nem csak a
képernyő hagyja le.

**Minden változtatás mellett ott a neve annak, aki csinálta**, a lead idővonalán. Aminél
nincs név, azt a rendszer csinálta magától.

Az értékesítő a saját leadjeit látja először: a Leads oldalon a **My leads** gombbal
szűkíthető, egy kattintással vissza mindenkire. Ez alapbeállítás, nem fal — egymás
helyettesítése normális.

Új fiókot a `CRM_USERS` környezeti változóban lehet felvenni, `név:jelszó:szerep` alakban.
Ha a szerep hiányzik **vagy elgépelted**, a fiók tulajdonosi jogot kap — egy elgépelés soha
ne zárjon ki valakit a saját CRM-jéből. Szólj, ha kell egy, és beállítom.

---

## 13. A napi rutin

**Reggel:**
1. Nyisd meg a **Mai teendők** oldalt (`/admin/today`). Ez a munkalista, sorrendbe rakva. Ha üres, minden kézben van.
2. Fentről lefelé dolgozol. A sorrendet nem neked kell fejben tartani — az oldal már abban a sorrendben adja: **akivel még senki nem beszélt** → **lejárt** → **mára időzített** → **elhallgatott** (hívás vagy WhatsApp, ne harmadik e-mail) → **nincs betervezve semmi** → **nem mozdul**.

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
| Presentation | 7 nap | „elakadt" jelzés |
| Visit | 10 nap | „elakadt" jelzés |
| Negotiation | 14 nap | „elakadt" jelzés |

Reserved, Contract és Won fázisban nincs időkorlát — ott már a fizetési ütem a mérce, a
Masterplanon. **Következő lépés viszont ott is kell**: egy foglalás, amin senki nem tervezett
semmit, pontosan az a pont, ahol az üzlet elvesztése a legdrágább.

**A lényeg**: a rendszer mindent számon tart helyetted — de csak akkor, ha a két kattintást (válaszra vár / teendő) minden kontakt után megnyomod. Ami be van jelölve, azt a CRM soha nem felejti el; ami nincs, azt senki.

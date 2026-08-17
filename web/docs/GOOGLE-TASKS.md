# Google Tasks — a jegyzetfal a telefonon

A CRM **Jegyzetek** fala tükröződik egy Google Tasks listába (`Longevity Resort`).
Ott van a telefonod Tasks appjában, a Gmail oldalsávjában és a Google Naptárban,
és a Google küldi az emlékeztetőt — nekünk nem kell push-infrastruktúrát építeni.

## Miért nem Google Keep?

Mert nem lehet. A Keepnek **nincs nyilvános API-ja**: az egyetlen hivatalos API
Google Workspace céges fiókokhoz készült, admin-célra, és személyes `@gmail.com`
fiókhoz nem adnak hozzáférést. Ezért nincs Keep-integrációja a Zapiernek és a
Make-nek sem. A Tasks a legközelebbi dolog, aminek van rendes, támogatott API-ja.

## Mi szinkronizálódik

| | |
|---|---|
| **Kártya → Feladat** | Minden nem archivált kártya. A cím a feladat neve; a szöveg, a checklist (`☐`/`☑`), a „Kire vár" és egy CRM-link a jegyzetbe kerül. A határidő átmegy. |
| **Feladat → Kártya** | Ha a telefonon **kipipálod** vagy **törlöd** a feladatot, a kártya **archiválódik** a CRM-ben (lekerül a falról, de nem vész el). |
| **Archiválás → Feladat** | Ha itt archiválsz egy kártyát, a feladat elkészültre vált a Google-ben. |

A checklist tételek **szövegként** mennek át, nem külön alfeladatként — a
pipálásukat a CRM-ben kell elvégezni.

**Mikor fut:** amikor megnyitod a Jegyzetek oldalt (a szerver 30 másodpercenként
engedi), a „Szinkron most" gombra, és naponta egyszer a hajnali körrel együtt.

---

## Egyszeri beállítás

Ezt a Google Cloud felületén kell elvégezni, nekem nincs hozzáférésem.

### 1. Projekt és API

1. Nyisd meg a <https://console.cloud.google.com> oldalt.
2. Fent válts **új projektre** — a neve lehet `Longevity CRM`.
3. **APIs & Services → Library** → keresd meg a **Google Tasks API**-t → **Enable**.

### 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** → Create
3. App name: `Longevity CRM`, support e-mail és developer e-mail: a saját címed → Save
4. **Fontos:** a végén nyomd meg a **PUBLISH APP** gombot (státusz: *In production*).

   Ha „Testing" állapotban marad, a Google **7 naponta érvényteleníti** a
   hozzáférést, és hetente újra kellene kötni. Publikálva nem jár le.

   Mivel az alkalmazás nincs Google-ellenőrzésen (nem is kell, egyetlen saját
   fiókról van szó), az összekötéskor egyszer megjelenik egy figyelmeztető
   képernyő: **Advanced → Go to Longevity CRM (unsafe)**. Ez a saját alkalmazásod,
   nyugodtan mehetsz tovább.

### 3. OAuth kliens

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application**
3. **Authorized redirect URIs** — mindkettőt vedd fel, pontosan így:

   ```
   https://longevitysamui.com/api/crm/google/callback
   http://localhost:3000/api/crm/google/callback
   ```

4. **Create** → másold ki a **Client ID** és a **Client secret** értéket.

### 4. A kulcsok beírása

**Helyben** — `web/.env.local`, két új sor:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

**Élesben** — Vercel → a `longevity-resort` projekt → Settings → Environment
Variables → Production, ugyanez a két változó. Utána egy új deploy kell, hogy
életbe lépjenek.

### 5. Összekötés

CRM → **Jegyzetek** → alul a **Összekötés** gomb → Google-belépés → engedélyezés.
Visszatérés után azonnal lefut az első szinkron, és a telefonod Tasks appjában
megjelenik a **Longevity Resort** lista.

---

## Ha valami nem megy

| Amit látsz | Mi a baj |
|---|---|
| „még nincs beállítva" | A `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` hiányzik abból a környezetből. |
| `redirect_uri_mismatch` | A 3. lépés URI-ja nem pontosan egyezik. Perjel, `http` vs `https`, port — mind számít. |
| „Google did not return a refresh token" | A fiók már engedélyezte korábban. Google-fiók → Biztonság → Harmadik felek → vedd el az engedélyt a `Longevity CRM`-től, és kösd össze újra. |
| Hetente kéri az újra-engedélyezést | Az alkalmazás „Testing" állapotban maradt. Lásd a 2. lépés **PUBLISH APP** részét. |

**Szétkapcsolás:** a Jegyzetek oldal alján. A tokent törli a CRM; a Google-ben
már kint lévő feladatok megmaradnak.

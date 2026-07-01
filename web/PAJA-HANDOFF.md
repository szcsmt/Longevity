# Longevity Resort — Website Handoff (for Paja)

_Snapshot: 2026-07-01. Live site: https://longevitysamui.com_

This document explains everything needed to finish the CRM / tracking integration.
The **website side of the lead pipeline is done and tested**; what remains is on the
make.com / Bigin / GTM / CookieYes dashboards (your side), plus the access the owner
must grant you (section 8).

---

## 1. What this is
- Marketing site for Longevity Resort (pre-construction private pool residences, Plai Laem, Koh Samui).
- Stack: **Next.js 16** (App Router, TypeScript, Turbopack) on **Vercel**. Client-side i18n (6 languages). No database.
- Code lives in the **`web/`** folder.
- ⚠️ `web/AGENTS.md`: this Next version has breaking changes vs older docs — check `node_modules/next/dist/docs` before using Next APIs.

## 2. Run / build / deploy
```
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```
Deploy: Vercel project **`longevity-resort`** (Root Directory = `web/`).
From the repo root: `npx vercel --prod --yes` (the `.vercel` link + `.vercelignore` are at repo root; only `web/` is uploaded).

## 3. Lead pipeline (the CRM part) — how it works
Every form submits via JavaScript to a server route, which forwards **server-side** to the make.com webhook (so the webhook URL never appears in the browser):

```
Form  →  POST /api/lead  (web/app/api/lead/route.ts)  →  process.env.MAKE_WEBHOOK  →  make.com  →  Bigin
```

**JSON payload sent for every lead:**
`form_type`, `form_origin`, `name`, `email`, `phone`, `whatsapp`, `gdpr_consent`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `source`,
`page_url`, `submitted_at`.

- **`form_type`**: `enquiry` (the popup) · `reserve` (bottom Reserve form) · `brochure_request` (brochure).
- **`form_origin`** (which CTA/section opened the form → for hot/warm/cold scoring):
  `fab`, `investment`, `interior`, `keyfacts`, `reserve`, `villa: Residence M/L/XL`.
- **UTM / source capture**: `web/lib/source.ts` (`captureUtm`, `sendLead`) + `web/components/source-tracker.tsx`
  (runs on every page load). Links like `?utm_source=plakat&utm_medium=qr` or `?source=FBMARKETING`
  are captured and kept for the whole session, then sent with the lead.

**DONE (website):** all forms POST to /api/lead → make.com (tested end-to-end, make.com returned HTTP 200);
required GDPR checkbox + hidden source on all three forms; `form_origin` on every CTA.

**LEFT (make.com / Bigin — your side):** in make.com, after the webhook add the Bigin module,
map the fields, set the hot/warm/cold rules by `form_type` / `form_origin` (per your CTA strategy doc:
reserve = warm, brochure = cold, etc.), and **turn the scenario ON** (a webhook only captures while ON;
"Run once" captures a single event only). To change the webhook URL: Vercel → env var `MAKE_WEBHOOK` → redeploy.

## 4. Analytics / GTM
- GTM container **`GTM-PG5LJCZL`** is installed in `web/app/layout.tsx` (loader in `<head>` via `next/script`, noscript iframe after `<body>`).
- **GA4 and Meta Pixel are NOT configured yet** — add them as **tags inside GTM**, gated by Consent Mode (section 5). There is no hardcoded GA/Pixel in the site; everything goes through GTM.
- **Vercel Web Analytics** is active (cookieless, `@vercel/analytics`) — visible in the Vercel dashboard.
- If you want a `dataLayer` event on form submit (for GTM triggers), it's a one-line add in `sendLead` (`web/lib/source.ts`) — currently the lead goes only via /api/lead.

## 5. Consent (CookieYes — Google-certified CMP)
- **CookieYes is now added via GTM** (per your request) — the direct `<script>` was **removed** from the site code and from production. CookieYes client_data ID: **`2926553fd3e7d76877f91545cb4ce7c3`** (full src: `https://cdn-cookieyes.com/client_data/2926553fd3e7d76877f91545cb4ce7c3/script.js`).
- **In the CookieYes dashboard:** enable **"Google Consent Mode"**, **publish** the banner, set geo-targeting.
- ⚠️ **Consent timing:** loaded via GTM, CookieYes runs *after* GTM. Make sure the Consent Mode default (`denied`) is set before any tag fires (e.g., a Consent Initialization / default-consent step in GTM that runs first).
- ⚠️ **Do not** also add the CookieYes `<script>` back into the site — it would load twice.
- Reopen consent: elements with class `cky-banner-element` (footer "Cookie preferences" + the /cookies page) trigger CookieYes.

## 6. Environment variables (Vercel → Settings → Environment Variables)
- **`MAKE_WEBHOOK`** = the make.com Custom Webhook URL (already set; server-side, not exposed).
- (No GA/Pixel env vars — those live in GTM.)

## 7. Domain / hosting
- **longevitysamui.com** — DNS on **Cloudflare** points to Vercel: A `@` → `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`, **DNS-only** (grey cloud). SSL = Vercel Let's Encrypt (live).
- Google Workspace **email** MX/DKIM records live on Cloudflare — **do not remove**.

## 8. Access the owner must grant you
- [ ] **Vercel** project `longevity-resort` (set env vars / deploy) — or share the env values.
- [ ] **GTM** container `GTM-PG5LJCZL` (configure GA4 / Pixel tags + consent triggers).
- [ ] **make.com** scenario (you have the webhook).
- [ ] **Bigin** (CRM).
- [ ] **CookieYes** dashboard.
- [ ] **Google Analytics** account (create the GA4 property; add the tag in GTM).
- [ ] **The code** — this repo / the backup zip. (Cloudflare DNS access only if DNS changes are needed.)

## 9. Key files
| File | Purpose |
|---|---|
| `web/app/layout.tsx` | GTM + CookieYes + global mounts |
| `web/app/api/lead/route.ts` | Server route that forwards leads to `MAKE_WEBHOOK` |
| `web/lib/source.ts` | UTM/source capture + `sendLead()` |
| `web/components/enquiry-modal.tsx` | In-place enquiry popup — `openEnquiry(origin)` |
| `web/components/cta-section.tsx` | Bottom Reserve form |
| `web/components/brochure-download.tsx` | Brochure **request** form (no direct download) |
| `web/lib/dictionaries.ts` | All copy, 6 languages |

## 10. Notes / pending (NOT CRM — for the owner, not blocking your work)
- **Key-facts band** (`web/components/key-facts.tsx`, first section after the hero, with a villa render): **preview pending the owner's approval**, English-only. It is **rendered on localhost/dev only** (`web/app/page.tsx`: `process.env.NODE_ENV === 'development'`), so it does **not** appear in production. To enable in production once approved: change that line to `<KeyFactsBand />`.
- Recent **English copy overhaul** is EN-only for the changed strings; DE/HU/FR/ZH/RU still show the older text on those strings until re-translated.
- **Legal pages** (`/privacy`, `/cookies`, `/imprint`) are DRAFT templates — need a lawyer + real company details.
- **3D tour** = 3destate viewer (villas). Labels inside it (House 13, "Make inquiry", etc.) are set in the 3destate project, not this code.

## 11. Backup / restore
- Full source backup: `longevity-web-backup-2026-07-01.zip` (repo root).
- Git restore point: tag **`backup-2026-07-01-pre-paja`** (`git checkout backup-2026-07-01-pre-paja`).

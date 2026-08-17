#!/usr/bin/env node
/* ── The review sheet for everything the CRM sends by itself ──

   Renders every automatic message from the real builders in lib/crm, so what
   you approve is what actually goes out. Nothing here is transcribed by hand;
   a copy change in letters.ts shows up the next time this is run.

     node scripts/letters-preview.cjs [output.html]

   The letter modules are pure by design (no store, no mailer, no Node APIs),
   which is what makes this possible at all — they are compiled to CommonJS in
   a temp directory and required. The digest is the one exception: it reads the
   store, so only its pure `digestHtml` is used, on a hand-made sample.

   Env matters to the output. CRM_BOOKING_URL decides whether the buttons open
   a calendar or a mailto, and CRM_SIGNATURE_NAME decides whether the office or
   a named agent signs. The page states which way it was rendered. */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WEB = path.resolve(__dirname, '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(WEB, 'docs', 'letters-preview.html');

/* ── Compile the pure modules ──
   CommonJS on purpose: these files import each other without file extensions,
   which ESM will not resolve but require() will. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'letters-preview-'));
execFileSync(
  'npx',
  ['tsc',
    'lib/crm/letters.ts', 'lib/crm/notify.ts', 'lib/crm/forward.ts',
    'lib/crm/digest.ts', 'lib/crm/sequence.ts',
    /* rootDir pins the emitted tree to the project root. Without it tsc infers
       it from the common ancestor of the inputs and the paths below shift. */
    '--outDir', tmp, '--rootDir', '.', '--module', 'commonjs', '--moduleResolution', 'node',
    '--target', 'es2022', '--esModuleInterop', '--skipLibCheck', '--resolveJsonModule'],
  { cwd: WEB, stdio: 'inherit' },
);

const L = require(path.join(tmp, 'lib/crm/letters.js'));
const { newLeadEmail } = require(path.join(tmp, 'lib/crm/notify.js'));
const { forwardEmail } = require(path.join(tmp, 'lib/crm/forward.js'));
const { digestHtml } = require(path.join(tmp, 'lib/crm/digest.js'));
const { SEQUENCE_STEPS } = require(path.join(tmp, 'lib/crm/sequence.js'));
const { documentById } = require(path.join(tmp, 'lib/crm/documents.js'));

/* ── The sample lead ──
   A plausible enquiry rather than "Test Test": placeholder names make copy read
   as a template, and the whole point of this page is to read it as a letter. */
const base = {
  id: '8f14e45f-ceea-467a-9ba1-5c2e0a1b3d77',
  name: 'Anna Meyer',
  email: 'anna.meyer@example.com',
  phone: '+49 170 1234567',
  villa: 'Residence L',
  stage: 'new', score: 'warm', notes: [], tasks: [],
  created_at: '2026-08-10T09:00:00.000Z', updated_at: '2026-08-10T09:00:00.000Z',
};
const lead = (extra) => ({ ...base, ...extra });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

/* ── What goes on the sheet, and what each entry says about itself ── */

const enquiry = lead({ form_type: 'enquiry', form_origin: 'fab' });
const reserve = lead({ form_type: 'reserve', form_origin: 'villa: Residence L' });
const brochure = lead({ form_type: 'brochure_request', form_origin: 'investment', villa: undefined });
const waLead = lead({ email: undefined, whatsapp: '+49 170 1234567', form_type: 'whatsapp', form_origin: 'fab' });

const stepMeta = Object.fromEntries(SEQUENCE_STEPS.map((s) => [s.step, s]));

/* Straight from the sales library rather than a label typed here — the page
   count and the file behind a link change, and a preview that quietly disagrees
   with the catalogue is worse than no preview. */
const docLabel = (id) => {
  const d = documentById(id);
  return d ? `${esc(d.title)} <span class="dim">— ${esc(d.note)}</span>` : esc(id);
};
const docShort = (id) => {
  const d = documentById(id);
  return d ? esc(d.note.split('.')[0]) : esc(id);
};

const sequence = [
  {
    step: 'welcome',
    when: '0. perc',
    whenLong: 'Azonnal, amint a lead beérkezik',
    trigger: 'Weboldali űrlap (<code>/api/lead</code>) vagy első WhatsApp üzenet (<code>/api/whatsapp</code>). Nem a napi cron küldi — a beérkezés pillanatában megy ki.',
    note: 'Ebből <b>három változat</b> van, aszerint hogy mit töltött ki a látogató. A tárgy és a nyitómondat is más.',
    variants: [
      { label: 'a) Általános érdeklődés', sub: 'form_type: enquiry', mail: L.welcomeEmail(enquiry) },
      { label: 'b) Foglalási szándék vagy konkrét villa', sub: 'form_type: reserve, vagy villa-oldalról', mail: L.welcomeEmail(reserve) },
      { label: 'c) Brosúra-kérés', sub: 'form_type: brochure_request', mail: L.welcomeEmail(brochure) },
    ],
  },
  { step: 'reminder', when: '3. nap', whenLong: 'Három nappal a welcome után', trigger: 'Napi cron (00:00 UTC = 07:00 Samui), ha a welcome kiment és az ügyfél azóta sem szólalt meg.', mail: L.reminderEmail(enquiry) },
  { step: 'story', when: '10. nap', whenLong: 'Tíz nappal a welcome után', trigger: 'Napi cron, változatlan csendben.', note: 'Itt megy ki először a <b>teljes 52 oldalas brosúra</b>. Szándékosan nem a 0. napon: egy idegen az első napon nem nyitja meg, aki idáig eljutott, igen.', mail: L.storyEmail(enquiry) },
  { step: 'viewing', when: '24. nap', whenLong: 'Huszonnégy nappal a welcome után', trigger: 'Napi cron, változatlan csendben.', note: 'A sorozat legerősebb lépése: aki látja a helyet — akár videón —, dönt.', mail: L.viewingEmail(enquiry) },
  { step: 'terms', when: '45. nap', whenLong: 'Negyvenöt nappal a welcome után', trigger: 'Napi cron, változatlan csendben.', mail: L.termsEmail(enquiry) },
  { step: 'closing', when: '60. nap', whenLong: 'Hatvan nappal a welcome után', trigger: 'Napi cron. Ez az utolsó — utána a CRM magától soha többé nem ír ennek a leadnek.', note: 'Kimondja, hogy abbahagyjuk. Jó modor, és a gyakorlatban erre érkezik a legtöbb válasz.', mail: L.closingEmail(enquiry) },
];

const internal = [
  {
    title: 'Új lead értesítő',
    when: 'Azonnal, minden új leadnél',
    to: 'CRM_NOTIFY_TO (belső, pl. crm@longevitysamui.com)',
    trigger: 'Űrlap, WhatsApp, Cal.com foglalás vagy beérkező e-mail hoz létre egy új leadet.',
    mail: newLeadEmail(reserve),
  },
  {
    title: 'Továbbított válasz',
    when: 'Azonnal, minden beérkező üzenetnél',
    to: 'CRM_NOTIFY_TO — e-mailnél a Reply-To az ügyfélre mutat, WhatsAppnál nem',
    trigger: 'Az ügyfél válaszol e-mailben vagy WhatsAppon. A tetején az AI-összefoglaló, ha az <code>ANTHROPIC_API_KEY</code> be van állítva.',
    mail: forwardEmail({
      lead: waLead,
      channel: 'whatsapp',
      body: 'Hi, is Residence L still available? And what would the total be with the furnishing package?',
      brief: 'Konkrét egységet kérdez és az árat — vásárlási szándék, nem böngészés.\nSürgősség: magas. Javasolt válasz: elérhetőség + pontos ár 24 órán belül.',
    }),
  },
  {
    title: 'Reggeli összefoglaló',
    when: 'Minden reggel 07:00-kor (Samui) — 00:00 UTC',
    to: 'CRM_DIGEST_TO, ennek hiányában CRM_NOTIFY_TO',
    trigger: 'Vercel Cron. Akkor is lefut, ha a vevői levelezés ki van kapcsolva: hogy mit kell ma csinálni, az független attól, küldünk-e leveleket.',
    mail: {
      subject: 'Longevity CRM — a mai teendők',
      html: digestHtml({
        date: '2026-08-10',
        unanswered: [{ leadId: base.id, name: 'Anna Meyer', detail: '2 napja írt, még nem válaszolt senki' }],
        overdue: [{ leadId: base.id, name: 'Thomas Bauer', detail: 'Visszahívás — 1 napja lejárt' }],
        untouched: [{ leadId: base.id, name: 'Sophie Laurent', detail: 'Tegnap érkezett, nincs hozzárendelve' }],
        awaiting: [{ leadId: base.id, name: 'Marco Rossi', detail: '4 napja nem válaszol' }],
        warming: [{ leadId: base.id, name: 'Elena Petrova', detail: 'Megnyitotta a brosúrát ma reggel' }],
        stalled: [{ leadId: base.id, name: 'James Whitfield', detail: 'Qualified — 21 napja mozdulatlan' }],
        noNext: [{ leadId: base.id, name: 'Klara Nowak', detail: 'Aktív, de nincs következő lépés' }],
        total: 7,
      }),
    },
  },
];

/* ── The page ── */

/* The letters point at the logo on the live site, which is right for a real
   inbox and wrong for a review sheet: it has to survive being opened offline or
   forwarded to a designer. Swapped for a data URI in the preview only — the
   letters themselves are untouched. */
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(WEB, 'public/email/logo.png')).toString('base64');
const inlineLogo = (html) => html.split('https://longevitysamui.com/email/logo.png').join(LOGO);

const frame = (html, id) =>
  `<iframe class="mail" id="${id}" srcdoc="${attr(inlineLogo(html))}" title="E-mail előnézet" loading="lazy"></iframe>`;

const chat = (text) => text
  ? `<div class="wa"><div class="wa-h">Ugyanez WhatsAppon <span>— ha a leadnek nincs e-mail címe, csak száma</span></div><div class="wa-b">${esc(text).replace(/\n/g, '<br>')}</div></div>`
  : '';

const metaRow = (k, v) => `<div class="mk">${k}</div><div class="mv">${v}</div>`;

function mailBlock(m, id, extraMeta = '') {
  return `
    <div class="meta">
      ${metaRow('Tárgy', `<b>${esc(m.subject)}</b>`)}
      ${extraMeta}
    </div>
    ${frame(m.html, id)}`;
}

let n = 0;
const uid = () => `f${++n}`;

const sequenceHtml = sequence.map((s) => {
  const meta = stepMeta[s.step];
  const wa = L.whatsappMessage(s.step, waLead);
  const body = s.variants
    ? s.variants.map((v) => `
        <div class="variant">
          <div class="vh"><span class="vl">${esc(v.label)}</span><span class="vs">${esc(v.sub)}</span></div>
          ${mailBlock(v.mail, uid())}
        </div>`).join('')
    : mailBlock(s.mail, uid());

  return `
  <section class="step" id="step-${s.step}">
    <div class="when"><span class="day">${esc(s.when)}</span><span class="daylong">${esc(s.whenLong)}</span></div>
    <h2>${esc(meta.label)}</h2>
    <p class="purpose">${esc(meta.note)}</p>
    <div class="meta">
      ${metaRow('Mikor megy ki', s.trigger)}
      ${metaRow('Csatorna', 'E-mail. Ha a leadnek nincs e-mail címe, de van száma, WhatsAppon megy — lásd lent.')}
      ${metaRow('Csatolt dokumentum', meta.doc ? `${docLabel(meta.doc)}<br><span class="dim">Követett <code>/d/</code> linken, tehát látod ki nyitotta meg.</span>` : '<span class="dim">Nincs — ennek a levélnek a dolga kérdezni, nem adni.</span>')}
    </div>
    ${s.note ? `<p class="note">${s.note}</p>` : ''}
    ${body}
    ${chat(wa)}
  </section>`;
}).join('');

const internalHtml = internal.map((x) => `
  <section class="step internal" id="int-${uid()}">
    <div class="when"><span class="day">Belső</span><span class="daylong">${esc(x.when)}</span></div>
    <h2>${esc(x.title)}</h2>
    <div class="meta">
      ${metaRow('Mikor megy ki', x.trigger)}
      ${metaRow('Címzett', esc(x.to))}
    </div>
    ${mailBlock(x.mail, uid())}
  </section>`).join('');

const overview = sequence.map((s) => {
  const meta = stepMeta[s.step];
  const subject = s.variants ? s.variants.map((v) => v.mail.subject) : [s.mail.subject];
  return `<tr>
    <td class="t-day">${esc(s.when)}</td>
    <td><a href="#step-${s.step}">${esc(meta.label)}</a></td>
    <td>${subject.map((x) => esc(x)).join('<br>')}</td>
    <td>${meta.doc ? docShort(meta.doc) : '<span class="dim">—</span>'}</td>
  </tr>`;
}).join('');

const booking = process.env.CRM_BOOKING_URL
  ? 'be van állítva, tehát a gombok a naptárat nyitják, előre kitöltött névvel és e-mail címmel'
  : '<b>nincs beállítva</b>, ezért a „Book a call” gombok egyelőre <code>mailto:</code>-ra esnek vissza';
const signature = process.env.CRM_SIGNATURE_NAME
  ? `az iroda írja alá (<code>${esc(process.env.CRM_SIGNATURE_NAME)}</code>), személynév nélkül`
  : 'nincs iroda-aláírás beállítva, ezért a lead gazdája írja alá — vagy a névsor első embere, ha még nincs gazdája';

const page = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Longevity CRM — az automatikus levelek</title>
<style>
  :root {
    --page:#12100C; --card:#1A1712; --line:rgba(201,164,106,0.22);
    --gold:#C9A46A; --goldhi:#D8B87C; --ink:#E6DFD1; --dim:#9E937E;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--page); color:var(--ink);
    font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:64px 24px 120px; }
  h1 { font:400 40px/1.2 Georgia,'Times New Roman',serif; color:var(--goldhi); margin:0 0 16px; }
  h2 { font:400 27px/1.3 Georgia,'Times New Roman',serif; color:var(--goldhi); margin:6px 0 10px; }
  h3 { font:400 21px/1.3 Georgia,'Times New Roman',serif; color:var(--goldhi); margin:56px 0 14px; }
  a { color:var(--gold); }
  .lede { font-size:17px; color:var(--ink); margin:0 0 10px; }
  .dim { color:var(--dim); }
  code { font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--goldhi);
    background:rgba(201,164,106,0.10); padding:1px 5px; border-radius:3px; }

  .panel { background:var(--card); border:1px solid var(--line); border-radius:6px;
    padding:22px 26px; margin:26px 0; }
  .panel p:last-child { margin-bottom:0; }

  table.ov { width:100%; border-collapse:collapse; margin:8px 0 0; font-size:14px; }
  table.ov th { text-align:left; font:400 10px/1.4 inherit; letter-spacing:0.22em;
    text-transform:uppercase; color:#E4C48F; padding:0 12px 10px 0; border-bottom:1px solid var(--line); }
  table.ov td { padding:12px 12px 12px 0; border-bottom:1px solid rgba(201,164,106,0.10); vertical-align:top; }
  table.ov .t-day { color:var(--gold); white-space:nowrap; font-family:Georgia,serif; font-size:16px; }

  .step { padding-top:64px; margin-top:52px; border-top:1px solid var(--line); }
  .step:first-of-type { border-top:none; }
  .when { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  .day { font:400 13px/1 inherit; letter-spacing:0.22em; text-transform:uppercase; color:var(--gold); }
  .daylong { font-size:13px; color:var(--dim); }
  .purpose { margin:0 0 18px; color:var(--dim); font-size:15px; }
  .note { margin:16px 0 0; padding:13px 16px; font-size:14.5px;
    background:rgba(201,164,106,0.07); border-left:2px solid var(--gold); border-radius:0 4px 4px 0; }

  .meta { display:grid; grid-template-columns:158px 1fr; gap:9px 18px;
    margin:20px 0 22px; padding:18px 20px; font-size:14px;
    background:var(--card); border:1px solid var(--line); border-radius:6px; }
  .mk { font:400 10px/1.9 inherit; letter-spacing:0.20em; text-transform:uppercase; color:#E4C48F; }
  .mv { color:var(--ink); }

  .variant { margin:34px 0 0; }
  .vh { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:2px; }
  .vl { font:400 18px/1.4 Georgia,serif; color:var(--goldhi); }
  .vs { font:13px/1.5 ui-monospace,Menlo,monospace; color:var(--dim); }

  iframe.mail { display:block; width:100%; max-width:600px; margin:0 auto; border:1px solid var(--line);
    border-radius:6px; background:#060E08; }

  .wa { max-width:600px; margin:26px auto 0; }
  .wa-h { font:400 10px/1.6 inherit; letter-spacing:0.20em; text-transform:uppercase;
    color:#E4C48F; margin-bottom:10px; }
  .wa-h span { letter-spacing:0.04em; text-transform:none; color:var(--dim); font-size:12px; }
  .wa-b { background:#0B231A; border:1px solid rgba(37,211,102,0.28); border-radius:10px 10px 10px 2px;
    padding:15px 18px; font-size:15px; line-height:1.62; color:#DCE9E0;
    /* The tracked links are long and unbreakable; without this they run out of
       the bubble exactly as they would in a narrow chat window. */
    overflow-wrap:anywhere; }

  .stops li { margin-bottom:9px; }
  footer { margin-top:80px; padding-top:26px; border-top:1px solid var(--line);
    font-size:13px; color:var(--dim); }
  @media (max-width:640px) { .meta { grid-template-columns:1fr; gap:3px 0; } .mk { margin-top:10px; } }
</style>
</head>
<body>
<div class="wrap">

<h1>Az automatikus levelek</h1>
<p class="lede">Minden, amit a CRM magától elküld — pontosan úgy renderelve, ahogy kimegy.
Nem másolat: ez a lap a <code>lib/crm</code> valódi generátoraiból készült, tehát ha a szöveg
változik a kódban, itt is változik.</p>

<div class="panel">
  <p><b>Mielőtt bármit elolvasnál:</b> a vevői levelezés akkor él, ha a <code>RESEND_API_KEY</code>
  és a küldő cím be van állítva. Amíg nincs, minden levél néma — a CRM mindent rögzít, csak nem
  küld. A leállító feltételek (lentebb) akkor is érvényesek, amikor él.</p>
  <p style="margin-top:12px"><b>Naptár:</b> ${booking}.<br>
  <b>Aláírás:</b> ${signature}.<br>
  <b>A minta:</b> az &bdquo;Anna Meyer / Residence L&rdquo; kitalált lead — a nevet, a villanevet és
  minden linket a valódi adatból tölt ki a rendszer.</p>
</div>

<h3>A vevői sorozat, egy lapon</h3>
<table class="ov">
  <tr><th>Mikor</th><th>Lépés</th><th>Tárgy</th><th>Dokumentum</th></tr>
  ${overview}
</table>

<div class="panel stops" style="margin-top:34px">
  <p style="margin:0 0 12px"><b>Mikor áll le a sorozat?</b> Bármelyik alábbi elég hozzá,
  és onnantól a CRM magától egyetlen levelet sem küld ennek a leadnek:</p>
  <ul style="margin:0; padding-left:20px">
    <li>az ügyfél <b>megszólal</b> — válaszol e-mailben vagy WhatsAppon (ez a leggyakoribb);</li>
    <li>leiratkozik a levél alján lévő linkkel;</li>
    <li>az üzlet elmozdul: <code>reserved</code>, <code>won</code> vagy <code>lost</code> lesz — innentől ember viszi;</li>
    <li>nem kapta meg a 0. perces welcome-ot. Ez védelem: a kapcsoló felkapcsolásakor
      a régi leadek nem kapnak visszamenőleg levéláradatot.</li>
  </ul>
  <p style="margin:14px 0 0" class="dim">Egy leadnek naponta legfeljebb egy levél megy ki, és
  minden lépés legfeljebb egyszer. Ha a cron kimarad néhány napra, a lead nem ébred négy levélre:
  csak a legkésőbbi esedékes lépés megy ki.</p>
</div>

${sequenceHtml}

<h3 style="margin-top:80px">Belső levelek — ezek nem az ügyfélnek mennek</h3>
<p class="dim" style="margin-top:0">Ugyanúgy automatikusak, de a te postafiókodba érkeznek.
A szövegük működési, nem marketing — de attól még ezt látod majd minden reggel.</p>
${internalHtml}

<h3 style="margin-top:80px">Ami <em>nem</em> automatikus</h3>
<div class="panel">
  <p><b>Az árajánlat.</b> A <code>/api/crm/leads/[id]/offer</code> csak akkor generál ajánlatot,
  ha egy ember rákattint a CRM-ben. Soha nem megy ki magától — ez szándékos.</p>
  <p style="margin-top:12px"><b>Kézzel írt válaszok.</b> Amit te írsz a leadnek, azt semmilyen
  szabály nem érinti; a leiratkozás is csak az automata sorozatot állítja le.</p>
</div>

<footer>
  Generálva a <code>web/scripts/letters-preview.cjs</code> szkripttel a <code>lib/crm</code>
  valódi generátoraiból. Újrafuttatás: <code>node scripts/letters-preview.cjs</code>.
</footer>

</div>
<script>
  /* Each letter is its own document, so its height is only knowable once it has
     loaded. Measured after load and again on resize, because the 600px column
     reflows on a narrow phone. */
  function fit(f) {
    try {
      var d = f.contentDocument;
      if (d) f.style.height = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 'px';
    } catch (e) { f.style.height = '900px'; }
  }
  var frames = document.querySelectorAll('iframe.mail');
  frames.forEach(function (f) {
    if (f.contentDocument && f.contentDocument.readyState === 'complete') fit(f);
    f.addEventListener('load', function () { fit(f); });
  });
  window.addEventListener('resize', function () { frames.forEach(fit); });
  /* Fonts and the logo land after load and change the height under us. */
  window.addEventListener('load', function () { setTimeout(function () { frames.forEach(fit); }, 400); });
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${OUT}  (${(page.length / 1024).toFixed(0)} kB)`);

import Link from 'next/link';
import { isAuthed } from '@/lib/crm/auth';
import { ANSWER_HOURS, REPLY_FLAG_DAYS } from '@/lib/crm/rules';
import { scheduleSummary } from '@/lib/crm/schedule';
import { houseSchedule } from '@/lib/crm/schedule';

export const dynamic = 'force-dynamic';

/* ── How this thing works ──

   Every screen in the CRM explains itself; none of them explains the others.
   Somebody on their first morning can read the lead page and still not know
   where a lead came from, what the CRM does on its own overnight, or why a
   villa going to "sold" changed a name on a different screen. They learn it
   by accident over weeks, and the parts they never happen to trip over they
   never learn at all.

   So: three pictures. Not a manual — the handbook is the manual — but the
   shape of the thing, which is the part that does not fit in prose. The
   numbers in them are read from the live configuration rather than typed,
   because a diagram that says "24 hours" while the CRM is set to 48 teaches
   somebody something false. */

const GOLD = 'var(--c-gold)';
const CREAM = 'var(--c-cream)';
const MUT = 'var(--c-mut)';
const HOT = 'var(--c-hot)';

function Box({ x, y, w = 150, h = 46, label, sub, tone = 'plain' }: {
  x: number; y: number; w?: number; h?: number;
  label: string; sub?: string; tone?: 'plain' | 'gold' | 'hot';
}) {
  const stroke = tone === 'gold' ? GOLD : tone === 'hot' ? HOT : 'var(--c-line)';
  const fill = tone === 'gold' ? 'rgba(201,169,110,0.10)'
    : tone === 'hot' ? 'rgba(224,119,78,0.10)' : 'rgba(228,217,195,0.03)';
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="9" fill={fill} stroke={stroke} strokeWidth="1" />
      <text x={x + w / 2} y={sub ? y + h / 2 - 3 : y + h / 2 + 5} textAnchor="middle"
        fill={tone === 'plain' ? CREAM : stroke} fontSize="13.5" fontWeight="600">{label}</text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill={MUT} fontSize="11.5">{sub}</text>
      )}
    </g>
  );
}

/** A straight arrow with an optional word on it. */
function Arrow({ x1, y1, x2, y2, label, dashed }: {
  x1: number; y1: number; x2: number; y2: number; label?: string; dashed?: boolean;
}) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MUT} strokeWidth="1.3"
        markerEnd="url(#tip)" strokeDasharray={dashed ? '5 4' : undefined} />
      {label && (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle" fill={MUT} fontSize="11.5">{label}</text>
      )}
    </g>
  );
}

const Defs = () => (
  <defs>
    <marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={MUT} />
    </marker>
  </defs>
);

function Figure({ title, blurb, height, children }: {
  title: string; blurb: string; height: number; children: React.ReactNode;
}) {
  return (
    <div className="crm-card" style={{ marginBottom: 18 }}>
      <h3>{title}</h3>
      <p className="crm-sub" style={{ margin: '0 0 14px' }}>{blurb}</p>
      <div className="diagram">
        <svg viewBox={`0 0 860 ${height}`} width="100%" height="auto" role="img" aria-label={title}>
          <Defs />
          {children}
        </svg>
      </div>
    </div>
  );
}

export default async function HelpPage() {
  if (!(await isAuthed())) return null;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Hogyan működik</h1>
          <p className="crm-sub">
            Három ábra arról, mi történik a rendszerben — és mi az, ami magától.
            A részletes leírás a kézikönyvben van; ez a rendszer alakja.
          </p>
        </div>
      </div>

      <Figure
        title="1 · Honnan jön a lead, és kihez kerül"
        blurb="Minden érdeklődő ugyanazon a kapun jön be, bármelyik csatornán érkezett. Ezért van egy helyen az összes."
        height={250}
      >
        <Box x={10} y={20} w={150} label="Weboldal" sub="űrlap, brossúra" />
        <Box x={10} y={82} w={150} label="WhatsApp" sub="céges szám" />
        <Box x={10} y={144} w={150} label="E-mail" sub="sales@" />
        <Box x={10} y={206} w={150} label="Ügynökség" sub="partner portál" />

        <Arrow x1={165} y1={43} x2={295} y2={110} />
        <Arrow x1={165} y1={105} x2={295} y2={118} />
        <Arrow x1={165} y1={167} x2={295} y2={130} />
        <Arrow x1={165} y1={229} x2={295} y2={140} />

        <Box x={300} y={100} w={170} h={54} label="Lead" sub="egy ember, egy lap" tone="gold" />

        <Arrow x1={475} y1={127} x2={575} y2={90} label="nyelv szerint" />
        <Arrow x1={475} y1={127} x2={575} y2={186} />

        <Box x={580} y={64} w={170} label="Értékesítő" sub="ő felel érte" />
        <Box x={580} y={160} w={170} label="Ügynökség" sub="ő kapja a jutalékot" />

        <text x={300} y={215} fill={MUT} fontSize="12">
          Ugyanaz az ember kétszer ír? A CRM összevonja — egy lap marad, minden előzménnyel.
        </text>
      </Figure>

      <Figure
        title="2 · Mi történik magától"
        blurb="Ez a rész dolgozik akkor is, amikor senki nem nézi a CRM-et. Semmit nem kell hozzá megnyomni."
        height={290}
      >
        <Box x={10} y={30} w={170} h={54} label="Kiment egy e-mail" sub="te írtad, vagy az automata" />
        <Arrow x1={185} y1={57} x2={290} y2={57} />
        <Box x={295} y={30} w={180} h={54} label="Válaszra várunk" tone="gold" />
        <Arrow x1={480} y1={57} x2={600} y2={57} label={`${REPLY_FLAG_DAYS} nap némaság`} />
        <Box x={605} y={30} w={175} h={54} label="Elhallgatott" sub="felkerül a listádra" tone="hot" />

        <Box x={10} y={130} w={170} h={54} label="Írt neked" sub="e-mail vagy WhatsApp" />
        <Arrow x1={185} y1={157} x2={290} y2={157} />
        <Box x={295} y={130} w={180} h={54} label="Te tartozol válasszal" tone="gold" />
        <Arrow x1={480} y1={157} x2={600} y2={157} label={`${ANSWER_HOURS} óra`} />
        <Box x={605} y={130} w={175} h={54} label="Lejárt" sub="piros jelzés" tone="hot" />

        <Box x={10} y={230} w={170} h={46} label="Hívást rögzítesz" />
        <Arrow x1={185} y1={253} x2={290} y2={253} />
        <Box x={295} y={230} w={180} h={46} label="Visszahívás beírva" tone="gold" />
        <Arrow x1={480} y1={253} x2={600} y2={253} label="a nap reggelén" />
        <Box x={605} y={230} w={175} h={46} label="Naptár + e-mail" />
      </Figure>

      <Figure
        title="3 · Az út az aláírásig"
        blurb="A fázis nem díszítés: a rendszer ebből tudja, kivel mi a dolgod. A jobb oldali három lépést a Masterplan írja át magától."
        height={210}
      >
        <Box x={10} y={20} w={128} label="Új" sub="még senki" />
        <Arrow x1={143} y1={43} x2={183} y2={43} />
        <Box x={188} y={20} w={128} label="Kapcsolatban" sub="beszéltetek" />
        <Arrow x1={321} y1={43} x2={361} y2={43} />
        <Box x={366} y={20} w={128} label="Minősítve" sub="tudod a keretet" />
        <Arrow x1={499} y1={43} x2={539} y2={43} />
        <Box x={544} y={20} w={128} label="Bemutató" />
        <Arrow x1={677} y1={43} x2={717} y2={43} />
        <Box x={722} y={20} w={128} label="Tárgyalás" />

        <Arrow x1={786} y1={70} x2={786} y2={108} />

        <Box x={722} y={112} w={128} label="Lefoglalva" tone="gold" sub="egy lakás a nevén" />
        <Arrow x1={717} y1={135} x2={677} y2={135} />
        <Box x={544} y={112} w={128} label="Szerződés" tone="gold" sub="aláírva" />
        <Arrow x1={539} y1={135} x2={499} y2={135} />
        <Box x={366} y={112} w={128} label="Megvette" tone="gold" sub="minden befizetve" />

        <text x={10} y={130} fill={MUT} fontSize="12">A bal oldali lépéseket</text>
        <text x={10} y={148} fill={MUT} fontSize="12">te állítod. Az arany</text>
        <text x={10} y={166} fill={MUT} fontSize="12">hármat a Masterplan</text>
        <text x={10} y={184} fill={MUT} fontSize="12">írja át magától.</text>
      </Figure>

      <div className="crm-card">
        <h3>Amit érdemes tudni</h3>
        <ul className="help-list">
          <li>
            <b>Semmi nem vész el.</b> Amit a céges e-mail címre írnak vagy onnan kimegy, és amit a
            céges WhatsApp-számra írnak, az magától felkerül a lead lapjára. A telefonhívás az egyetlen,
            amit be kell írni — egy kattintás, és az is beírja a visszahívást.
          </li>
          <li>
            <b>Minden aktív leadnek van következő lépése.</b> Ha nincs, a lead felkerül a
            {' '}<Link href="/admin/today" className="crm-row" style={{ color: 'var(--c-gold)' }}>Mai teendők</Link>{' '}
            listára. Ez a rendszer egyetlen igazi szabálya.
          </li>
          <li>
            <b>A lead törlése nem törlés.</b> Archiválva minden előzmény megmarad — ez a fejlesztő
            adatbázisa, nem az éppen ott dolgozóé.
          </li>
          <li>
            <b>A fizetési ütem: {scheduleSummary(houseSchedule())}.</b> Egy lakás akkor kapja meg
            ezeket a feltételeket, amikor először megállapodtok pénzben — a ház ütemének későbbi
            módosítása soha nem írja át a már megkötött üzletet.
          </li>
        </ul>
      </div>
    </>
  );
}

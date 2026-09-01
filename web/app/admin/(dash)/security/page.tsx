import { ROLES, isAdmin, isAuthed, listAccounts } from '@/lib/crm/auth';
import { listSessions, sessionPolicy } from '@/lib/crm/sessions';
import { readAudit, recentFailures, type AuditAction } from '@/lib/crm/audit';
import { RevokeButton } from '@/components/crm/revoke-button';

export const dynamic = 'force-dynamic';

const ACTION: Record<AuditAction, string> = {
  login: 'Belépés',
  'login.failed': 'Sikertelen belépés',
  logout: 'Kilépés',
  'session.revoked': 'Munkamenet megszakítva',
  'export.csv': 'CSV export',
  'backup.mailed': 'Mentés kiküldve',
  'leads.purge': 'Végleges törlés',
  'settings.changed': 'Beállítás módosítva',
};

/* Az események, amiknél nem elég tudni, hogy megtörténtek — azt is látni kell,
   hogy melyik sorban. Mind a kettő adatot visz ki a rendszerből. */
const LOUD: AuditAction[] = ['login.failed', 'export.csv', 'backup.mailed', 'leads.purge', 'session.revoked'];

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'most';
  if (min < 60) return `${min} perce`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} órája`;
  return `${Math.round(h / 24)} napja`;
}

/* A böngésző neve elég ahhoz, hogy valaki felismerje a saját gépét, és nem
   több — a teljes user agent egy sornyi verziószám, amit senki nem olvas el. */
function device(agent?: string): string {
  if (!agent) return 'ismeretlen eszköz';
  const os = /iPhone|iPad/.test(agent) ? 'iPhone/iPad'
    : /Android/.test(agent) ? 'Android'
    : /Mac OS X|Macintosh/.test(agent) ? 'Mac'
    : /Windows/.test(agent) ? 'Windows'
    : /Linux/.test(agent) ? 'Linux' : '';
  const browser = /Edg\//.test(agent) ? 'Edge'
    : /OPR\//.test(agent) ? 'Opera'
    : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari'
    : /Firefox\//.test(agent) ? 'Firefox'
    : /curl/.test(agent) ? 'curl' : '';
  return [browser, os].filter(Boolean).join(' · ') || agent.slice(0, 40);
}

/* ── Biztonság ──

   Három kérdésre válaszol, és mind a háromra eddig nem volt válasz sehol:
   ki van most bent, ki próbált bejönni, és mi ment ki innen.

   Az utolsó a lényeg. Egy CRM-ben az adat nem attól van bajban, hogy valaki
   „feltöri" — hanem attól, hogy egy jogosult fiókról egy kattintással
   letölthető az egész névsor, és eddig ez nyomtalanul történt. Most nem. */
export default async function SecurityPage() {
  if (!(await isAuthed())) return null;
  if (!(await isAdmin())) {
    return (
      <>
        <div className="crm-head"><h1 className="crm-title">Biztonság</h1></div>
        <div className="crm-card">
          <div className="empty" style={{ padding: 46 }}>
            Ez az oldal a tulajdonosé. Aki be van lépve és mit töltött le innen —
            olyan kérdés, amire egyvalakinek kell látnia a választ.
          </div>
        </div>
      </>
    );
  }

  const [sessions, log, failures] = await Promise.all([
    listSessions(), readAudit(120), recentFailures(24),
  ]);
  const accounts = listAccounts();
  const policy = sessionPolicy();
  const plaintext = accounts.filter((a) => !a.hashed);
  const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label || id;

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Biztonság</h1>
          <p className="crm-sub">
            {sessions.length === 0
              ? 'Jelenleg senki nincs belépve.'
              : `${sessions.length} élő munkamenet. A belépés ${policy.idleHours} óra tétlenség után, de legkésőbb ${policy.maxDays} nap múlva lejár.`}
          </p>
        </div>
      </div>

      {/* A figyelmeztetések előre. Ha van mit nézni, ne kelljen görgetni érte. */}
      {failures.length >= 5 && (
        <div className="crm-card" style={{ marginBottom: 18 }}>
          <div className="q-row">
            <div className="q-who">
              <div className="crm-name">{failures.length} sikertelen belépés az elmúlt 24 órában</div>
              <div className="crm-meta">
                {[...new Set(failures.map((f) => f.ip || 'ismeretlen'))].slice(0, 4).join(', ')} —
                {' '}ha ez nem te voltál, cserélj jelszót és szakítsd meg a munkameneteket.
              </div>
            </div>
          </div>
        </div>
      )}

      {plaintext.length > 0 && (
        <div className="crm-card" style={{ marginBottom: 18 }}>
          <div className="q-row">
            <div className="q-who">
              <div className="crm-name">
                {plaintext.length} fiók jelszava olvashatóan áll a beállításokban
              </div>
              <div className="crm-meta">
                {plaintext.map((a) => a.name).join(', ')} — aki látja a Vercel környezeti
                változóit, látja a jelszavukat is. Titkosításhoz:
                {' '}<code>node scripts/crm-hash.mjs</code>, és a kapott értéket írd a jelszó helyére.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Ki van bent ── */}
      <div className="crm-card" style={{ marginBottom: 18 }}>
        <div className="crm-head" style={{ marginBottom: 10 }}>
          <h2 className="crm-title" style={{ fontSize: 17 }}>Élő munkamenetek</h2>
        </div>
        {sessions.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>Senki nincs belépve.</div>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="q-row">
              <div className="q-who">
                <div className="crm-name">{s.user}</div>
                <div className="crm-meta">
                  {device(s.agent)} · {s.ip || 'ismeretlen cím'} · belépett {ago(s.started)},
                  utoljára aktív {ago(s.seen)}
                </div>
              </div>
              <div className="q-act">
                <RevokeButton
                  id={s.id}
                  label="Kiléptetés"
                  confirm={`${s.user} munkamenetét megszakítod ezen az eszközön. Újra be kell majd jelentkeznie.`}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Fiókok ── */}
      <div className="crm-card" style={{ marginBottom: 18 }}>
        <div className="crm-head" style={{ marginBottom: 10 }}>
          <h2 className="crm-title" style={{ fontSize: 17 }}>Fiókok</h2>
          <p className="crm-sub">
            Aki be tud lépni. A „minden eszközön” az, amit egy távozó munkatárs
            után kell megnyomni — még aznap.
          </p>
        </div>
        {accounts.map((a) => {
          const live = sessions.filter((s) => s.user.trim().toLowerCase() === a.name.trim().toLowerCase()).length;
          return (
            <div key={a.name} className="q-row">
              <div className="q-who">
                <div className="crm-name">{a.name}</div>
                <div className="crm-meta">
                  {roleLabel(a.role)} · {a.hashed ? 'jelszó titkosítva' : 'jelszó olvashatóan tárolva'}
                  {live > 0 ? ` · ${live} élő munkamenet` : ''}
                </div>
              </div>
              <div className="q-act">
                {live > 0 && (
                  <RevokeButton
                    user={a.name}
                    label="Minden eszközön"
                    confirm={`${a.name} összes munkamenetét megszakítod (${live} eszköz).`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mi történt ── */}
      <div className="crm-card">
        <div className="crm-head" style={{ marginBottom: 10 }}>
          <h2 className="crm-title" style={{ fontSize: 17 }}>Napló</h2>
          <p className="crm-sub">
            Belépés, exportálás, mentés — minden, amivel adat mozdul. Hat hónapra visszamenőleg.
          </p>
        </div>
        {log.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>Még nincs bejegyzés.</div>
        ) : (
          log.map((e, n) => (
            <div key={`${e.at}-${n}`} className="q-row">
              <div className="q-who">
                <div className="crm-name">
                  {ACTION[e.action] || e.action} — {e.actor}
                </div>
                <div className="crm-meta">
                  {new Date(e.at).toLocaleString('hu-HU')}
                  {e.ip ? ` · ${e.ip}` : ''}
                  {e.agent ? ` · ${device(e.agent)}` : ''}
                  {e.detail ? ` · ${e.detail}` : ''}
                </div>
              </div>
              <div className="q-tags">
                {LOUD.includes(e.action) && <span className="badge stage">{ACTION[e.action]}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

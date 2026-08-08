import { COOKIE_TABLE, type Category } from '@/lib/consent';

/* The cookie declaration, rendered from the same list the consent code uses —
   so the page cannot drift from what the banner actually governs. */

const LABEL: Record<Category, string> = {
  necessary: 'Strictly necessary',
  preferences: 'Preferences',
  analytics: 'Statistics',
  marketing: 'Marketing',
};

const ORDER: Category[] = ['necessary', 'preferences', 'analytics', 'marketing'];

export function CookieTable() {
  return (
    <>
      {ORDER.map((cat) => {
        const rows = COOKIE_TABLE.filter((c) => c.category === cat);
        if (!rows.length) return null;
        return (
          <div key={cat} style={{ margin: '22px 0' }}>
            <h3 style={{ fontSize: 15, letterSpacing: '0.04em', marginBottom: 10 }}>{LABEL[cat]}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, lineHeight: 1.6 }}>
                <thead>
                  <tr>
                    {['Name', 'Provider', 'Purpose', 'Retention'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 10px 8px 0', fontWeight: 400,
                        borderBottom: '1px solid rgba(201,169,110,0.3)', whiteSpace: 'nowrap',
                        letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10, opacity: 0.75,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.name}>
                      <td style={{ padding: '10px 10px 10px 0', verticalAlign: 'top', borderBottom: '1px solid rgba(201,169,110,0.12)', whiteSpace: 'nowrap' }}><code>{c.name}</code></td>
                      <td style={{ padding: '10px 10px 10px 0', verticalAlign: 'top', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>{c.provider}</td>
                      <td style={{ padding: '10px 10px 10px 0', verticalAlign: 'top', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>{c.purpose}</td>
                      <td style={{ padding: '10px 10px 10px 0', verticalAlign: 'top', borderBottom: '1px solid rgba(201,169,110,0.12)', whiteSpace: 'nowrap' }}>{c.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

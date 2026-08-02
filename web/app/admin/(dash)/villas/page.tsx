import Link from 'next/link';
import { listLeads } from '@/lib/crm/store';
import type { Lead } from '@/lib/crm/types';
import { STAGES } from '@/lib/crm/types';
import { VILLAS, fmtTHB, villaByName } from '@/lib/crm/villas';

export const dynamic = 'force-dynamic';

/* Demand board per residence: every lead whose villa matches, the strongest
   stage reached, and a derived status — Sold if a deal was won, Under offer
   while one is reserved, otherwise Available. */

type VillaStatus = 'sold' | 'under offer' | 'available';

function statusOf(leads: Lead[]): VillaStatus {
  if (leads.some((l) => l.stage === 'won')) return 'sold';
  if (leads.some((l) => l.stage === 'reserved')) return 'under offer';
  return 'available';
}

const fmtDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export default async function VillasPage() {
  const leads = await listLeads();
  const byVilla = VILLAS.map((v) => {
    const interested = leads.filter((l) => villaByName(l.villa)?.name === v.name && l.stage !== 'lost');
    return { villa: v, interested, status: statusOf(interested) };
  });
  const unmatched = leads.filter((l) => l.villa && !villaByName(l.villa) && l.stage !== 'lost');

  return (
    <>
      <div className="crm-head">
        <div>
          <h1 className="crm-title">Residences</h1>
          <p className="crm-sub">Demand per residence — who is interested, and how far along each conversation is.</p>
        </div>
        <Link className="crm-btn" href="/admin/pipeline">Pipeline →</Link>
      </div>

      <div className="crm-grid villas-grid">
        {byVilla.map(({ villa, interested, status }) => {
          const hot = interested.filter((l) => l.score === 'hot').length;
          return (
            <div className="crm-card" key={villa.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 24 }}>{villa.name}</div>
                  <div className="crm-meta">{villa.size} · {fmtTHB(villa.price)}</div>
                </div>
                <span className={`badge villa-${status.replace(' ', '-')}`}>{status}</span>
              </div>

              <div className="crm-meta" style={{ margin: '14px 0 6px' }}>
                {interested.length} interested{hot ? ` · ${hot} hot` : ''}
              </div>
              {interested.length === 0 && <div className="empty" style={{ textAlign: 'left', padding: '8px 0' }}>No active leads yet.</div>}
              {interested
                .slice()
                .sort((a, b) => STAGES.findIndex((s) => s.id === b.stage) - STAGES.findIndex((s) => s.id === a.stage))
                .slice(0, 6)
                .map((l) => (
                  <Link key={l.id} href={`/admin/leads/${l.id}`} className="crm-row att-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="crm-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || 'Unknown'}</div>
                      <div className="crm-meta">{fmtDay(l.submitted_at || l.created_at)} · {l.source || l.utm_source || 'direct'}</div>
                    </div>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <span className={`badge ${l.score}`}>{l.score}</span>
                      <span className="badge stage">{STAGES.find((s) => s.id === l.stage)?.label}</span>
                    </span>
                  </Link>
                ))}
              {interested.length > 6 && (
                <div className="crm-meta" style={{ marginTop: 8 }}>
                  <Link href={`/admin/leads?q=${encodeURIComponent(villa.name)}`} className="crm-row" style={{ color: 'var(--c-gold)' }}>
                    All {interested.length} leads →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unmatched.length > 0 && (
        <div className="crm-card" style={{ marginTop: 16 }}>
          <h3>Other villa interest</h3>
          <p className="crm-meta" style={{ marginTop: -6, marginBottom: 12 }}>
            Leads whose villa note doesn&apos;t match the catalogue.
          </p>
          {unmatched.slice(0, 8).map((l) => (
            <Link key={l.id} href={`/admin/leads/${l.id}`} className="crm-row att-row">
              <div style={{ minWidth: 0 }}>
                <div className="crm-name">{l.name || 'Unknown'}</div>
                <div className="crm-meta">&ldquo;{l.villa}&rdquo;</div>
              </div>
              <span className={`badge ${l.score}`}>{l.score}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Agency } from '@/lib/crm/types';

/* ── Giving an agency the keys ──

   One code per agency, not an account per person: an agency is a firm we have
   an agreement with, and issuing a login to each of their people would be a
   user directory we then have to run.

   The code is shown ONCE. It is stored as a hash, so it genuinely cannot be
   read back — which is the only honest way to hold somebody's credential, and
   the reason this component makes such a point of it. */
export function PortalAccess({ agency: initial }: { agency: Agency }) {
  const router = useRouter();
  const [agency, setAgency] = useState(initial);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = Boolean(agency.portal_token_hash);

  async function send(op: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/agencies/${agency.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data?.error || 'That change could not be saved.'); return; }
      if (data.agency) setAgency(data.agency);
      setToken(data.token || null);
      setCopied(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-card">
      <h3>Partner portal</h3>

      {token && (
        <div className="lost-hint" style={{ marginBottom: 14 }}>
          <div className="crm-meta" style={{ marginBottom: 6 }}>
            Their access code — <strong>copy it now</strong>. It is stored only as a hash and
            cannot be shown again; a lost code is replaced, not recovered.
          </div>
          <code style={{ display: 'block', fontSize: 15, wordBreak: 'break-all', margin: '8px 0' }}>{token}</code>
          <button
            className="crm-btn sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(token);
                setCopied(true);
              } catch {
                window.prompt('Copy this code:', token);
              }
            }}
          >
            {copied ? '✓ Copied' : 'Copy code'}
          </button>
        </div>
      )}

      {open ? (
        <>
          <div className="crm-meta" style={{ marginBottom: 12 }}>
            Access is open. They sign in at <strong>/portal</strong> with their code, register
            buyers themselves, and see the ones they introduced — nobody else&rsquo;s, and a
            status in five words rather than our pipeline.
            {agency.portal_seen_at
              ? ` Last used ${agency.portal_seen_at.slice(0, 10)}.`
              : ' They have not used it yet.'}
          </div>
          <div className="act-row">
            <button className="crm-btn sm" disabled={busy} onClick={() => send('openPortal')}>
              Issue a new code
            </button>
            <button className="crm-btn danger sm" disabled={busy}
              onClick={() => {
                if (confirm(`Close ${agency.name}'s portal access?\n\nTheir code stops working immediately, and so does any session they have open. Their registrations are untouched.`)) {
                  send('closePortal');
                }
              }}>
              Close access
            </button>
          </div>
          <div className="crm-meta" style={{ marginTop: 8 }}>
            Issuing a new code replaces the old one and signs out anybody using it.
          </div>
        </>
      ) : (
        <>
          <div className="crm-meta" style={{ marginBottom: 12 }}>
            No portal access. Opening it lets this agency register buyers themselves and check
            whether somebody is already registered — which is the argument that otherwise
            happens by e-mail three days later.
          </div>
          <button className="crm-btn sm" disabled={busy} onClick={() => send('openPortal')}>
            Open portal access
          </button>
        </>
      )}
    </div>
  );
}

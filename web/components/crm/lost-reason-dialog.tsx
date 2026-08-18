'use client';

import { useState } from 'react';
import { LOST_REASONS } from '@/lib/crm/types';

/* Structured "why did we lose this?" picker — every lost deal must carry a
   reason so the reports can teach us something. Used by the lead workspace
   and the pipeline board. */
export function LostReasonDialog({
  leadName, onConfirm, onCancel,
}: {
  leadName: string;
  onConfirm: (reasonId: string, detail: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>('');
  const [detail, setDetail] = useState('');

  return (
    <>
      <div className="lost-scrim" onClick={onCancel} />
      <div className="lost-box" role="dialog" aria-label="Lost reason">
        <h3>Why was {leadName || 'this lead'} lost?</h3>
        <div className="lost-opts">
          {LOST_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`crm-btn sm${reason === r.id ? ' gold' : ''}`}
              onClick={() => setReason(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* ── The most common wrong answer, caught at the moment it is given ──

            "Timing" is almost never a lost deal in this business. It is a buyer
            who will come back, and burying them under Closed Lost means nobody
            ever looks again and the lost-reason report fills up with deals that
            were never lost. The alternative is one card away on the lead page,
            and this is the only moment anybody will think about it. */}
        {reason === 'timing' && (
          <div className="lost-hint">
            Not buying <em>yet</em> is not the same as lost. Cancel, and use <strong>Not now</strong> on
            the lead instead — pick the date to come back to them, and the CRM will bring them up
            again on it with the reason attached.
          </div>
        )}

        <textarea
          className="crm-textarea"
          rows={2}
          placeholder="Optional detail — price gap, competitor, circumstances…"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
        <div className="act-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="crm-btn ghost sm" onClick={onCancel}>Cancel</button>
          <button
            className="crm-btn danger sm"
            disabled={!reason}
            onClick={() => onConfirm(reason, detail.trim())}
          >
            Mark as lost
          </button>
        </div>
      </div>
    </>
  );
}
